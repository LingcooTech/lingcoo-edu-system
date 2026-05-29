import { randomBytes } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { httpError } from '../../lib/http-error.js';
import { applyLessonDelta } from './lesson.js';

export type Order = typeof schema.orders.$inferSelect;

export async function listOrders(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.tenantId, tenantId))
    .orderBy(desc(schema.orders.createdAt));
}

export async function findOrderByOrderNo(db: Database, orderNo: string): Promise<Order | null> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.orderNo, orderNo))
    .limit(1);
  return order ?? null;
}

/**
 * Records the provider the customer chose for an order (before payment), so a
 * later reconciliation/sync knows which adapter to query. Does not change
 * order status.
 */
export async function markPaymentPrepared(db: Database, orderNo: string, provider: string) {
  await db
    .update(schema.orders)
    .set({ paymentProvider: provider, updatedAt: new Date() })
    .where(eq(schema.orders.orderNo, orderNo));
}

export async function sumPaidRevenue(db: Database, tenantId: string) {
  const rows = await db
    .select({ paidAmount: schema.orders.paidAmount, status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.tenantId, tenantId));
  return rows
    .filter((row) => row.status === 'paid')
    .reduce((sum, row) => sum + row.paidAmount, 0);
}

/**
 * Creates an order and, when status is 'paid', credits the student's lesson
 * account (purchase) in the same transaction. Mirrors the in-memory finance
 * flow but atomic. Used by admin/staff manual order entry.
 */
export async function createOrder(
  db: Database,
  input: {
    tenantId: string;
    studentId: string;
    courseId: string;
    amount: number;
    paidAmount: number;
    lessonCount: number;
    status: (typeof schema.orderStatusEnum.enumValues)[number];
  },
) {
  return db.transaction(async (tx) => {
    const orderNo = `EDU${Date.now()}`;
    const [order] = await tx
      .insert(schema.orders)
      .values({
        tenantId: input.tenantId,
        studentId: input.studentId,
        courseId: input.courseId,
        orderNo,
        amount: input.amount,
        paidAmount: input.paidAmount,
        lessonCount: input.lessonCount,
        status: input.status,
        paidAt: input.status === 'paid' ? new Date() : null,
      })
      .returning();

    if (order.status === 'paid' && order.lessonCount > 0) {
      await applyLessonDelta(tx, {
        tenantId: input.tenantId,
        studentId: input.studentId,
        courseId: input.courseId,
        type: 'purchase',
        amount: order.lessonCount,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      });
    }

    return order;
  });
}

/**
 * Creates a pending order for a parent buying a course package. The order
 * carries the resolved (studentId, courseId) so a later payment callback can
 * credit the right lesson account. Nothing is charged or credited yet.
 */
export async function createPackageOrder(
  db: Database,
  input: {
    tenantId: string;
    parentId: string;
    packageId: string;
    studentId: string;
    courseId: string;
    amount: number;
    lessonCount: number;
    currency?: string;
  },
): Promise<Order> {
  const orderNo = `EDU${Date.now()}${randomBytes(2).toString('hex').toUpperCase()}`;
  const [order] = await db
    .insert(schema.orders)
    .values({
      tenantId: input.tenantId,
      parentId: input.parentId,
      packageId: input.packageId,
      studentId: input.studentId,
      courseId: input.courseId,
      orderNo,
      amount: input.amount,
      paidAmount: 0,
      lessonCount: input.lessonCount,
      currency: input.currency ?? 'CNY',
      status: 'pending',
    })
    .returning();
  return order;
}

/**
 * Atomically marks an order paid and credits the linked lesson account. This is
 * the idempotent settlement core shared by mock / WeChat / Alipay callbacks:
 *
 *  - the order row is locked `FOR UPDATE` so concurrent callbacks serialize;
 *  - if the order is already paid we return `{ alreadyPaid: true }` and touch
 *    nothing (the caller ACKs so the provider stops retrying);
 *  - provider / amount / currency are validated against the order before any
 *    mutation, inside the transaction (no TOCTOU window);
 *  - the lesson account is credited (+lessonCount) with a `purchase` ledger row;
 *  - a `payments` row keyed by the unique `providerEventId` is inserted as a
 *    second idempotency safety net (`onConflictDoNothing`).
 *
 * All four writes commit together or not at all.
 */
export async function markOrderPaidAndCredit(
  db: Database,
  input: {
    orderNo: string;
    provider: string;
    providerOrderId: string;
    providerEventId: string;
    amount: number;
    currency: string;
    paidAt: Date;
    raw: Record<string, unknown>;
  },
): Promise<{ order: Order; alreadyPaid: boolean }> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNo, input.orderNo))
      .limit(1)
      .for('update');

    if (!order) {
      throw httpError(404, `Order not found: ${input.orderNo}`);
    }

    if (order.status === 'paid') {
      return { order, alreadyPaid: true };
    }

    if (order.paymentProvider && order.paymentProvider !== input.provider) {
      throw httpError(409, `Order provider mismatch for ${input.orderNo}`);
    }
    if (order.amount !== input.amount) {
      throw httpError(409, `Order amount mismatch for ${input.orderNo}`);
    }
    if (order.currency !== input.currency) {
      throw httpError(409, `Order currency mismatch for ${input.orderNo}`);
    }

    const [updated] = await tx
      .update(schema.orders)
      .set({
        status: 'paid',
        paidAmount: input.amount,
        paymentProvider: input.provider,
        providerOrderId: input.providerOrderId,
        paidAt: input.paidAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, order.id))
      .returning();

    if (order.studentId && order.courseId && order.lessonCount > 0) {
      await applyLessonDelta(tx, {
        tenantId: order.tenantId,
        studentId: order.studentId,
        courseId: order.courseId,
        type: 'purchase',
        amount: order.lessonCount,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
      });
    }

    await tx
      .insert(schema.payments)
      .values({
        orderNo: order.orderNo,
        provider: input.provider,
        providerOrderId: input.providerOrderId,
        providerEventId: input.providerEventId,
        amount: input.amount,
        status: 'paid',
        raw: input.raw,
      })
      .onConflictDoNothing({ target: schema.payments.providerEventId });

    return { order: updated, alreadyPaid: false };
  });
}
