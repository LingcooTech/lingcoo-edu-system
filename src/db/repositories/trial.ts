import { and, asc, eq, gt, lte } from 'drizzle-orm';

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

export async function listOpenFutureTrialSessions(
  db: Database,
  input: { from: Date; to?: Date; limit?: number },
) {
  const conditions = [
    eq(schema.trialSessions.status, 'open'),
    gt(schema.trialSessions.startsAt, input.from),
  ];
  if (input.to) {
    conditions.push(lte(schema.trialSessions.startsAt, input.to));
  }

  const sessions = await db
    .select()
    .from(schema.trialSessions)
    .where(and(...conditions))
    .orderBy(asc(schema.trialSessions.startsAt));

  return input.limit ? sessions.slice(0, input.limit) : sessions;
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

export async function closeExpiredTrialSessions(db: Database, now = new Date()) {
  return db
    .update(schema.trialSessions)
    .set({ status: 'closed', updatedAt: now })
    .where(and(eq(schema.trialSessions.status, 'open'), lte(schema.trialSessions.endsAt, now)))
    .returning();
}

export async function deleteTrialSession(db: Database, trialSessionId: string) {
  const [session] = await db
    .delete(schema.trialSessions)
    .where(eq(schema.trialSessions.id, trialSessionId))
    .returning();
  return session ?? null;
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

export async function decrementBookedCount(db: Database, trialSessionId: string) {
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
    .set({ bookedCount: Math.max(0, session.bookedCount - 1), updatedAt: new Date() })
    .where(eq(schema.trialSessions.id, trialSessionId));
}

export async function firstCampusId(db: Database) {
  const [campus] = await db.select({ id: schema.campuses.id }).from(schema.campuses).limit(1);
  if (!campus) {
    throw notFound('Campus not found');
  }
  return campus.id;
}
