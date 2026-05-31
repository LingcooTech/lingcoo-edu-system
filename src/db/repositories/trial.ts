import { asc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export type NewTrialSession = typeof schema.trialSessions.$inferInsert;

export async function listTrialSessions(db: Database) {
  return db.select().from(schema.trialSessions).orderBy(asc(schema.trialSessions.startsAt));
}

export async function listOpenTrialSessions(db: Database) {
  return db
    .select()
    .from(schema.trialSessions)
    .where(eq(schema.trialSessions.status, 'open'))
    .orderBy(asc(schema.trialSessions.startsAt));
}

export async function createTrialSession(db: Database, values: NewTrialSession) {
  const [session] = await db.insert(schema.trialSessions).values(values).returning();
  return session;
}

export async function requireTrialSession(db: Database, trialSessionId: string) {
  const [session] = await db
    .select()
    .from(schema.trialSessions)
    .where(eq(schema.trialSessions.id, trialSessionId))
    .limit(1);
  if (!session) {
    throw notFound('Trial session not found');
  }
  return session;
}

export async function updateTrialSession(
  db: Database,
  trialSessionId: string,
  patch: Partial<NewTrialSession>,
) {
  const [session] = await db
    .update(schema.trialSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.trialSessions.id, trialSessionId))
    .returning();
  return session ?? null;
}

export async function cancelTrialSession(db: Database, trialSessionId: string) {
  return updateTrialSession(db, trialSessionId, { status: 'cancelled' });
}

export async function incrementBookedCount(db: Database, trialSessionId: string) {
  const [session] = await db
    .select()
    .from(schema.trialSessions)
    .where(eq(schema.trialSessions.id, trialSessionId))
    .limit(1);
  if (!session) {
    return;
  }
  await db
    .update(schema.trialSessions)
    .set({ bookedCount: session.bookedCount + 1, updatedAt: new Date() })
    .where(eq(schema.trialSessions.id, trialSessionId));
}

export async function firstCampusId(db: Database) {
  const [campus] = await db.select({ id: schema.campuses.id }).from(schema.campuses).limit(1);
  if (!campus) {
    throw notFound('Campus not found');
  }
  return campus.id;
}
