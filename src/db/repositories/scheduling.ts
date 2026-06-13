import { and, asc, eq, gt, inArray, lte, ne } from 'drizzle-orm';

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

export async function deleteClass(db: Database, classId: string) {
  const [classGroup] = await db
    .delete(schema.classes)
    .where(eq(schema.classes.id, classId))
    .returning();
  return classGroup ?? null;
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

function lessonNotificationTargetSelect() {
  return {
    sessionId: schema.classSessions.id,
    startsAt: schema.classSessions.startsAt,
    endsAt: schema.classSessions.endsAt,
    topic: schema.classSessions.topic,
    classId: schema.classes.id,
    className: schema.classes.name,
    courseId: schema.courses.id,
    courseName: schema.courses.name,
    classroomId: schema.classrooms.id,
    classroomName: schema.classrooms.name,
    teacherId: schema.teachers.id,
    teacherName: schema.teachers.name,
    studentId: schema.students.id,
    studentName: schema.students.name,
  };
}

export async function listUpcomingLessonNotificationTargets(
  db: Database,
  input: { from: Date; until: Date },
) {
  return db
    .select(lessonNotificationTargetSelect())
    .from(schema.classSessions)
    .innerJoin(schema.classes, eq(schema.classSessions.classId, schema.classes.id))
    .innerJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .innerJoin(schema.classrooms, eq(schema.classSessions.classroomId, schema.classrooms.id))
    .innerJoin(schema.teachers, eq(schema.classSessions.teacherId, schema.teachers.id))
    .innerJoin(
      schema.classEnrollments,
      and(
        eq(schema.classEnrollments.classId, schema.classes.id),
        eq(schema.classEnrollments.active, true),
      ),
    )
    .innerJoin(schema.students, eq(schema.classEnrollments.studentId, schema.students.id))
    .where(
      and(
        eq(schema.classSessions.status, 'scheduled'),
        eq(schema.students.status, 'active'),
        gt(schema.classSessions.startsAt, input.from),
        lte(schema.classSessions.startsAt, input.until),
      ),
    )
    .orderBy(asc(schema.classSessions.startsAt));
}

export async function listLessonNotificationTargetsForSessionStudents(
  db: Database,
  sessionId: string,
  studentIds: string[],
) {
  if (studentIds.length === 0) {
    return [];
  }

  return db
    .select(lessonNotificationTargetSelect())
    .from(schema.classSessions)
    .innerJoin(schema.classes, eq(schema.classSessions.classId, schema.classes.id))
    .innerJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .innerJoin(schema.classrooms, eq(schema.classSessions.classroomId, schema.classrooms.id))
    .innerJoin(schema.teachers, eq(schema.classSessions.teacherId, schema.teachers.id))
    .innerJoin(schema.students, inArray(schema.students.id, studentIds))
    .where(eq(schema.classSessions.id, sessionId))
    .orderBy(asc(schema.students.name));
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

export async function deleteClassSession(db: Database, sessionId: string) {
  const [session] = await db
    .delete(schema.classSessions)
    .where(eq(schema.classSessions.id, sessionId))
    .returning();
  return session ?? null;
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
      and(eq(schema.classEnrollments.classId, classId), eq(schema.classEnrollments.active, true)),
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
