import { and, asc, eq, ne } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export async function listClasses(db: Database) {
  return db.select().from(schema.classes).orderBy(asc(schema.classes.createdAt));
}

export async function createClass(db: Database, values: typeof schema.classes.$inferInsert) {
  const [classGroup] = await db.insert(schema.classes).values(values).returning();
  return classGroup;
}

export async function updateClass(
  db: Database,
  classId: string,
  patch: Partial<typeof schema.classes.$inferInsert>,
) {
  const [classGroup] = await db
    .update(schema.classes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.classes.id, classId))
    .returning();
  return classGroup ?? null;
}

export async function archiveClass(db: Database, classId: string) {
  return updateClass(db, classId, { status: 'archived' });
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

export async function listClassSessions(db: Database) {
  return db.select().from(schema.classSessions).orderBy(asc(schema.classSessions.startsAt));
}

export async function createClassSession(
  db: Database,
  values: typeof schema.classSessions.$inferInsert,
) {
  const [session] = await db.insert(schema.classSessions).values(values).returning();
  return session;
}

export async function updateClassSession(
  db: Database,
  sessionId: string,
  patch: Partial<typeof schema.classSessions.$inferInsert>,
) {
  const [session] = await db
    .update(schema.classSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.classSessions.id, sessionId))
    .returning();
  return session ?? null;
}

/**
 * Detects a classroom/teacher time overlap for a non-cancelled session.
 * Mirrors the in-memory overlap rule: aStart < bEnd && bStart < aEnd, where a
 * candidate conflicts if it shares the classroom OR the teacher.
 */
export async function findScheduleConflict(
  db: Database,
  input: {
    startsAt: Date;
    endsAt: Date;
    classroomId: string;
    teacherId: string;
    ignoreSessionId?: string;
  },
) {
  const candidates = await db
    .select()
    .from(schema.classSessions)
    .where(ne(schema.classSessions.status, 'cancelled'));

  return (
    candidates.find(
      (session) =>
        session.id !== input.ignoreSessionId &&
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

export async function cancelClassSession(db: Database, sessionId: string) {
  return updateClassSession(db, sessionId, { status: 'cancelled' });
}

export async function findSession(db: Database, sessionId: string) {
  const [session] = await db
    .select()
    .from(schema.classSessions)
    .where(eq(schema.classSessions.id, sessionId))
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

export async function listEnrollments(db: Database, classId: string) {
  return db
    .select()
    .from(schema.classEnrollments)
    .where(
      and(
        eq(schema.classEnrollments.classId, classId),
        eq(schema.classEnrollments.active, true),
      ),
    )
    .orderBy(asc(schema.classEnrollments.createdAt));
}

export async function createEnrollment(
  db: Database,
  values: typeof schema.classEnrollments.$inferInsert,
) {
  const [existing] = await db
    .select()
    .from(schema.classEnrollments)
    .where(
      and(
        eq(schema.classEnrollments.classId, values.classId),
        eq(schema.classEnrollments.studentId, values.studentId),
      ),
    )
    .limit(1);

  if (existing) {
    const [enrollment] = await db
      .update(schema.classEnrollments)
      .set({ active: true })
      .where(eq(schema.classEnrollments.id, existing.id))
      .returning();
    return enrollment;
  }

  const [enrollment] = await db.insert(schema.classEnrollments).values(values).returning();
  return enrollment;
}

export async function removeEnrollment(db: Database, classId: string, enrollmentId: string) {
  const [enrollment] = await db
    .update(schema.classEnrollments)
    .set({ active: false })
    .where(
      and(
        eq(schema.classEnrollments.classId, classId),
        eq(schema.classEnrollments.id, enrollmentId),
      ),
    )
    .returning();
  return enrollment ?? null;
}
