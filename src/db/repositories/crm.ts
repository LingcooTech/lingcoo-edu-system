import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export type NewLead = typeof schema.leads.$inferInsert;
export type Lead = typeof schema.leads.$inferSelect;

export async function listLeads(db: Database) {
  return db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt));
}

export async function createLead(db: Database, values: NewLead) {
  const [lead] = await db.insert(schema.leads).values(values).returning();
  return lead;
}

export async function requireLead(db: Database, leadId: string) {
  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId))
    .limit(1);
  if (!lead) {
    throw notFound('Lead not found');
  }
  return lead;
}

export async function updateLead(
  db: Database,
  leadId: string,
  patch: Partial<typeof schema.leads.$inferInsert>,
) {
  const [lead] = await db
    .update(schema.leads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.leads.id, leadId))
    .returning();
  return lead;
}

export async function addFollowUp(db: Database, values: typeof schema.followUpRecords.$inferInsert) {
  const [record] = await db.insert(schema.followUpRecords).values(values).returning();
  return record;
}

export async function listFollowUps(db: Database, leadId: string) {
  return db
    .select()
    .from(schema.followUpRecords)
    .where(eq(schema.followUpRecords.leadId, leadId))
    .orderBy(desc(schema.followUpRecords.createdAt));
}
