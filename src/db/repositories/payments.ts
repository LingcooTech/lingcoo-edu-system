import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type Payment = typeof schema.payments.$inferSelect;

export async function findByProviderEventId(
  db: Database,
  providerEventId: string,
): Promise<Payment | null> {
  const [row] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.providerEventId, providerEventId))
    .limit(1);
  return row ?? null;
}

export async function listByOrderNo(db: Database, orderNo: string): Promise<Payment[]> {
  return db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.orderNo, orderNo))
    .orderBy(desc(schema.payments.createdAt));
}
