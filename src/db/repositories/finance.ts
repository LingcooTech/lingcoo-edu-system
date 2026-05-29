import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { applyLessonDelta } from './lesson.js';

export async function listOrders(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.tenantId, tenantId))
    .orderBy(desc(schema.orders.createdAt));
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
 * flow but atomic.
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
