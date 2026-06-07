import { and, desc, eq, gte, lte } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { httpError } from '../../lib/http-error.js';

export type SettlementBatch = typeof schema.settlementBatches.$inferSelect;
export type SettlementBatchOrder = typeof schema.settlementBatchOrders.$inferSelect;
export type SettlementOrder = typeof schema.orders.$inferSelect;

type PaymentReceiverType = (typeof schema.paymentReceiverTypeEnum.enumValues)[number];

export interface SettlementBatchWithOrders extends SettlementBatch {
  orders: Array<SettlementBatchOrder & { order?: SettlementOrder | null }>;
}

function displayReceiverName(order: SettlementOrder) {
  return order.paymentReceiverName?.trim() || '未标记收款方';
}

function matchesReceiver(
  order: SettlementOrder,
  input: {
    paymentReceiverType: PaymentReceiverType;
    paymentReceiverInstitutionId?: string | null;
    paymentReceiverName: string;
  },
) {
  if (order.paymentReceiverType !== input.paymentReceiverType) return false;
  if (input.paymentReceiverInstitutionId) {
    return order.paymentReceiverInstitutionId === input.paymentReceiverInstitutionId;
  }
  return displayReceiverName(order) === input.paymentReceiverName.trim();
}

export async function listSettlementBatches(db: Database): Promise<SettlementBatchWithOrders[]> {
  const [batches, batchOrders, orders] = await Promise.all([
    db.select().from(schema.settlementBatches).orderBy(desc(schema.settlementBatches.settledAt)),
    db.select().from(schema.settlementBatchOrders),
    db.select().from(schema.orders),
  ]);
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const rowsByBatchId = new Map<
    string,
    Array<SettlementBatchOrder & { order?: SettlementOrder | null }>
  >();

  for (const row of batchOrders) {
    const current = rowsByBatchId.get(row.settlementBatchId) ?? [];
    current.push({ ...row, order: orderById.get(row.orderId) ?? null });
    rowsByBatchId.set(row.settlementBatchId, current);
  }

  return batches.map((batch) => ({
    ...batch,
    orders: rowsByBatchId.get(batch.id) ?? [],
  }));
}

export async function createSettlementBatch(
  db: Database,
  input: {
    paymentReceiverType: PaymentReceiverType;
    paymentReceiverInstitutionId?: string | null;
    paymentReceiverName: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
    note?: string | null;
    createdByAccountId?: string | null;
  },
): Promise<SettlementBatchWithOrders> {
  return db.transaction(async (tx) => {
    const conditions = [eq(schema.orders.status, 'paid')];
    if (input.startsAt) {
      conditions.push(gte(schema.orders.paidAt, input.startsAt));
    }
    if (input.endsAt) {
      conditions.push(lte(schema.orders.paidAt, input.endsAt));
    }

    const [orders, settledRows] = await Promise.all([
      tx
        .select()
        .from(schema.orders)
        .where(and(...conditions))
        .orderBy(desc(schema.orders.paidAt)),
      tx
        .select({ orderId: schema.settlementBatchOrders.orderId })
        .from(schema.settlementBatchOrders)
        .innerJoin(
          schema.settlementBatches,
          eq(schema.settlementBatchOrders.settlementBatchId, schema.settlementBatches.id),
        )
        .where(eq(schema.settlementBatches.status, 'settled')),
    ]);

    const settledOrderIds = new Set(settledRows.map((row) => row.orderId));
    const eligibleOrders = orders.filter(
      (order) => !settledOrderIds.has(order.id) && matchesReceiver(order, input),
    );
    if (eligibleOrders.length === 0) {
      throw httpError(422, '没有可纳入本批次的未结算已支付订单');
    }

    const totalAmount = eligibleOrders.reduce((sum, order) => sum + order.paidAmount, 0);
    const [batch] = await tx
      .insert(schema.settlementBatches)
      .values({
        paymentReceiverType: input.paymentReceiverType,
        paymentReceiverInstitutionId: input.paymentReceiverInstitutionId ?? null,
        paymentReceiverName: input.paymentReceiverName.trim(),
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        orderCount: eligibleOrders.length,
        totalAmount,
        status: 'settled',
        note: input.note ?? null,
        createdByAccountId: input.createdByAccountId ?? null,
        settledAt: new Date(),
      })
      .returning();

    const batchOrders = await tx
      .insert(schema.settlementBatchOrders)
      .values(
        eligibleOrders.map((order) => ({
          settlementBatchId: batch.id,
          orderId: order.id,
          amount: order.paidAmount,
        })),
      )
      .returning();

    const orderById = new Map(eligibleOrders.map((order) => [order.id, order]));
    return {
      ...batch,
      orders: batchOrders.map((row) => ({ ...row, order: orderById.get(row.orderId) ?? null })),
    };
  });
}

export async function voidSettlementBatch(db: Database, settlementBatchId: string) {
  const [batch] = await db
    .update(schema.settlementBatches)
    .set({ status: 'voided', voidedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.settlementBatches.id, settlementBatchId))
    .returning();
  if (!batch) {
    throw httpError(404, 'Settlement batch not found');
  }
  return batch;
}
