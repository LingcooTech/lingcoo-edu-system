import { and, asc, eq, ne } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export async function listClasses(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.classes)
    .where(eq(schema.classes.tenantId, tenantId))
    .orderBy(asc(schema.classes.createdAt));
}

export async function createClass(db: Database, values: typeof schema.classes.$inferInsert) {
  const [classGroup] = await db.insert(schema.classes).values(values).returning();
  return classGroup;
}

export async function countActiveEnrollments(db: Database, classId: string) {
  const rows = await db
    .select({ id: schema.classEnrollments.id })
    .from(schema.classEnrollments)
    .where(
      and(eq(schema.classEnrollments.classId, classId), eq(schema.classEnrollments.active, true)),
    );
  return rows.length;
}

export async function listClassSessions(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.classSessions)
    .where(eq(schema.classSessions.tenantId, tenantId))
    .orderBy(asc(schema.classSessions.startsAt));
}

export async function createClassSession(
  db: Database,
  values: typeof schema.classSessions.$inferInsert,
) {
  const [session] = await db.insert(schema.classSessions).values(values).returning();
  return session;
}

/**
 * Detects a classroom/teacher time overlap for a non-cancelled session.
 * Mirrors the in-memory overlap rule: aStart < bEnd && bStart < aEnd, where a
 * candidate conflicts if it shares the classroom OR the teacher.
 */
export async function findScheduleConflict(
  db: Database,
  input: {
    tenantId: string;
    startsAt: Date;
    endsAt: Date;
    classroomId: string;
    teacherId: string;
  },
) {
  const candidates = await db
    .select()
    .from(schema.classSessions)
    .where(
      and(
        eq(schema.classSessions.tenantId, input.tenantId),
        ne(schema.classSessions.status, 'cancelled'),
      ),
    );

  return (
    candidates.find(
      (session) =>
        input.startsAt < session.endsAt &&
        session.startsAt < input.endsAt &&
        (session.classroomId === input.classroomId || session.teacherId === input.teacherId),
    ) ?? null
  );
}

export async function markSessionCompleted(db: Database, sessionId: string) {
  await db
    .update(schema.classSessions)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(schema.classSessions.id, sessionId));
}

export async function findSession(db: Database, tenantId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(schema.classSessions)
    .where(and(eq(schema.classSessions.tenantId, tenantId), eq(schema.classSessions.id, sessionId)))
    .limit(1);
  return session ?? null;
}

export async function findClass(db: Database, classId: string) {
  const [classGroup] = await db
    .select()
    .from(schema.classes)
    .where(eq(schema.classes.id, classId))
    .limit(1);
  return classGroup ?? null;
}
