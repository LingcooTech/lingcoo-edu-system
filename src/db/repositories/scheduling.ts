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

export async function listClassSessionsForClass(db: Database, classId: string) {
  return db
    .select()
    .from(schema.classSessions)
    .where(eq(schema.classSessions.classId, classId))
    .orderBy(asc(schema.classSessions.startsAt));
}

export function shouldSyncEnrollmentToSession(
  session: Pick<typeof schema.classSessions.$inferSelect, 'startsAt' | 'status'>,
  joinedAt: Date,
) {
  return session.status !== 'cancelled' && session.startsAt >= joinedAt;
}

export async function listClassSessionTeachers(db: Database, sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(schema.classSessionTeachers)
    .where(inArray(schema.classSessionTeachers.classSessionId, Array.from(new Set(sessionIds))))
    .orderBy(asc(schema.classSessionTeachers.createdAt));
}

export async function listClassSessionTeachersForTeacher(db: Database, teacherId: string) {
  return db
    .select()
    .from(schema.classSessionTeachers)
    .where(eq(schema.classSessionTeachers.teacherId, teacherId))
    .orderBy(asc(schema.classSessionTeachers.createdAt));
}

export async function replaceClassSessionTeachers(
  db: Database,
  sessionId: string,
  primaryTeacherId: string,
  teacherIds: string[],
) {
  const normalizedTeacherIds = Array.from(
    new Set([primaryTeacherId, ...teacherIds].filter(Boolean)),
  );
  await db
    .delete(schema.classSessionTeachers)
    .where(eq(schema.classSessionTeachers.classSessionId, sessionId));

  if (normalizedTeacherIds.length === 0) {
    return [];
  }

  return db
    .insert(schema.classSessionTeachers)
    .values(
      normalizedTeacherIds.map((teacherId) => ({
        classSessionId: sessionId,
        teacherId,
        role: teacherId === primaryTeacherId ? 'primary' : 'assistant',
      })),
    )
    .returning();
}

export async function listSessionsForCourse(db: Database, courseId: string) {
  return db
    .select()
    .from(schema.classSessions)
    .where(eq(schema.classSessions.courseId, courseId))
    .orderBy(asc(schema.classSessions.startsAt));
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
        lte(schema.classEnrollments.joinedAt, schema.classSessions.startsAt),
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
  if (session.classId) {
    const enrollments = await listEnrollmentHistory(db, session.classId);
    const roster = enrollments
      .filter(
        (enrollment) =>
          enrollment.joinedAt <= session.startsAt &&
          (!enrollment.leftAt || enrollment.leftAt > session.startsAt),
      )
      .map((enrollment) => ({
        classSessionId: session.id,
        studentId: enrollment.studentId,
        billingCourseId: enrollment.billingCourseId,
        source: 'enrollment',
        active: true,
      }));
    if (roster.length > 0) {
      await db
        .insert(schema.classSessionStudents)
        .values(roster)
        .onConflictDoNothing({
          target: [
            schema.classSessionStudents.classSessionId,
            schema.classSessionStudents.studentId,
          ],
        });
    }
  }
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
    teacherIds?: string[];
    ignoreSessionId?: string;
  },
) {
  const candidates = await db
    .select()
    .from(schema.classSessions)
    .where(ne(schema.classSessions.status, 'cancelled'));
  const assignments = await listClassSessionTeachers(
    db,
    candidates.map((session) => session.id),
  );
  const teacherIdsBySessionId = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const teacherIds = teacherIdsBySessionId.get(assignment.classSessionId) ?? new Set<string>();
    teacherIds.add(assignment.teacherId);
    teacherIdsBySessionId.set(assignment.classSessionId, teacherIds);
  }
  for (const session of candidates) {
    if (!teacherIdsBySessionId.has(session.id)) {
      teacherIdsBySessionId.set(session.id, new Set([session.teacherId]));
    }
  }
  const inputTeacherIds = new Set(input.teacherIds ?? [input.teacherId]);

  return (
    candidates.find((session) => {
      const assignedTeacherIds = teacherIdsBySessionId.get(session.id) ?? new Set<string>();
      const teacherConflicts = [...assignedTeacherIds].some((teacherId) =>
        inputTeacherIds.has(teacherId),
      );
      return (
        session.id !== input.ignoreSessionId &&
        input.startsAt < session.endsAt &&
        session.startsAt < input.endsAt &&
        (session.classroomId === input.classroomId || teacherConflicts)
      );
    }) ?? null
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

export async function listEnrollmentHistory(db: Database, classId: string) {
  return db
    .select()
    .from(schema.classEnrollments)
    .where(eq(schema.classEnrollments.classId, classId))
    .orderBy(asc(schema.classEnrollments.joinedAt));
}

export async function listTemporaryStudents(db: Database, sessionId: string) {
  return db
    .select()
    .from(schema.classSessionTemporaryStudents)
    .where(eq(schema.classSessionTemporaryStudents.classSessionId, sessionId))
    .orderBy(asc(schema.classSessionTemporaryStudents.createdAt));
}

export async function listTemporaryStudentsForSessions(db: Database, sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(schema.classSessionTemporaryStudents)
    .where(inArray(schema.classSessionTemporaryStudents.classSessionId, sessionIds))
    .orderBy(asc(schema.classSessionTemporaryStudents.createdAt));
}

export async function listTemporaryStudentsForStudents(db: Database, studentIds: string[]) {
  if (studentIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(schema.classSessionTemporaryStudents)
    .where(inArray(schema.classSessionTemporaryStudents.studentId, studentIds))
    .orderBy(asc(schema.classSessionTemporaryStudents.createdAt));
}

export async function findTemporaryStudent(
  db: Database,
  input: { sessionId: string; studentId: string },
) {
  const [temporaryStudent] = await db
    .select()
    .from(schema.classSessionTemporaryStudents)
    .where(
      and(
        eq(schema.classSessionTemporaryStudents.classSessionId, input.sessionId),
        eq(schema.classSessionTemporaryStudents.studentId, input.studentId),
      ),
    )
    .limit(1);
  return temporaryStudent ?? null;
}

export async function createTemporaryStudent(
  db: Database,
  values: typeof schema.classSessionTemporaryStudents.$inferInsert,
) {
  const [temporaryStudent] = await db
    .insert(schema.classSessionTemporaryStudents)
    .values(values)
    .returning();
  return temporaryStudent;
}

export async function removeTemporaryStudent(
  db: Database,
  input: { sessionId: string; temporaryStudentId: string },
) {
  const [temporaryStudent] = await db
    .delete(schema.classSessionTemporaryStudents)
    .where(
      and(
        eq(schema.classSessionTemporaryStudents.classSessionId, input.sessionId),
        eq(schema.classSessionTemporaryStudents.id, input.temporaryStudentId),
      ),
    )
    .returning();
  return temporaryStudent ?? null;
}

export type SessionRosterEntry = {
  id: string;
  source: 'enrollment' | 'session_only' | 'temporary';
  studentId: string;
  billingCourseId: string;
  classEnrollmentId?: string;
  temporaryStudentId?: string;
  note?: string | null;
};

export async function listSessionRoster(db: Database, sessionId: string) {
  const session = await findSession(db, sessionId);
  if (!session) {
    return [];
  }
  const snapshotRows = await db
    .select()
    .from(schema.classSessionStudents)
    .where(eq(schema.classSessionStudents.classSessionId, sessionId))
    .orderBy(asc(schema.classSessionStudents.createdAt));
  if (snapshotRows.length > 0) {
    return snapshotRows
      .filter((row) => row.active)
      .map((row) => ({
        id: row.id,
        source: row.source === 'enrollment' ? 'enrollment' : 'session_only',
        studentId: row.studentId,
        billingCourseId: row.billingCourseId,
      })) satisfies SessionRosterEntry[];
  }

  if (!session.classId) {
    return [];
  }
  const [classGroup, enrollments, temporaryStudents] = await Promise.all([
    findClass(db, session.classId),
    listEnrollmentHistory(db, session.classId),
    listTemporaryStudents(db, sessionId),
  ]);
  if (!classGroup) {
    return [];
  }

  const roster = new Map<string, SessionRosterEntry>();
  for (const enrollment of enrollments) {
    if (
      enrollment.joinedAt > session.startsAt ||
      (enrollment.leftAt && enrollment.leftAt <= session.startsAt)
    ) {
      continue;
    }
    roster.set(enrollment.studentId, {
      id: enrollment.id,
      source: 'enrollment',
      studentId: enrollment.studentId,
      billingCourseId: enrollment.billingCourseId,
      classEnrollmentId: enrollment.id,
    });
  }

  for (const temporaryStudent of temporaryStudents) {
    if (roster.has(temporaryStudent.studentId)) {
      continue;
    }
    roster.set(temporaryStudent.studentId, {
      id: temporaryStudent.id,
      source: 'temporary',
      studentId: temporaryStudent.studentId,
      billingCourseId: temporaryStudent.billingCourseId,
      temporaryStudentId: temporaryStudent.id,
      note: temporaryStudent.note,
    });
  }

  return Array.from(roster.values());
}

export async function listSessionStudentRows(db: Database, sessionId: string) {
  return db
    .select()
    .from(schema.classSessionStudents)
    .where(eq(schema.classSessionStudents.classSessionId, sessionId))
    .orderBy(asc(schema.classSessionStudents.createdAt));
}

export async function replaceSessionRoster(
  db: Database,
  sessionId: string,
  students: Array<{
    studentId: string;
    billingCourseId: string;
    source: 'enrollment' | 'session_only';
  }>,
) {
  await db
    .delete(schema.classSessionStudents)
    .where(eq(schema.classSessionStudents.classSessionId, sessionId));
  if (students.length === 0) {
    return [];
  }
  return db
    .insert(schema.classSessionStudents)
    .values(students.map((student) => ({ classSessionId: sessionId, ...student })))
    .returning();
}

export async function upsertSessionStudent(
  db: Database,
  values: typeof schema.classSessionStudents.$inferInsert,
) {
  const [row] = await db
    .insert(schema.classSessionStudents)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.classSessionStudents.classSessionId, schema.classSessionStudents.studentId],
      set: {
        billingCourseId: values.billingCourseId,
        source: values.source ?? 'session_only',
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function removeSessionStudent(
  db: Database,
  input: { sessionId: string; studentId: string },
) {
  const [row] = await db
    .update(schema.classSessionStudents)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(schema.classSessionStudents.classSessionId, input.sessionId),
        eq(schema.classSessionStudents.studentId, input.studentId),
      ),
    )
    .returning();
  return row ?? null;
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
      .set({
        active: true,
        billingCourseId: values.billingCourseId,
        joinedAt: values.joinedAt ?? new Date(),
        leftAt: null,
      })
      .where(eq(schema.classEnrollments.id, existing.id))
      .returning();
    await syncEnrollmentToEligibleSessions(db, enrollment);
    return enrollment;
  }

  const [enrollment] = await db.insert(schema.classEnrollments).values(values).returning();
  await syncEnrollmentToEligibleSessions(db, enrollment);
  return enrollment;
}

async function ensureSessionRosterSnapshot(db: Database, sessionId: string) {
  const rows = await listSessionStudentRows(db, sessionId);
  if (rows.length > 0) return;
  const legacyRoster = await listSessionRoster(db, sessionId);
  if (legacyRoster.length === 0) return;
  await replaceSessionRoster(
    db,
    sessionId,
    legacyRoster.map((entry) => ({
      studentId: entry.studentId,
      billingCourseId: entry.billingCourseId,
      source: entry.source === 'enrollment' ? 'enrollment' : 'session_only',
    })),
  );
}

async function syncEnrollmentToEligibleSessions(
  db: Database,
  enrollment: typeof schema.classEnrollments.$inferSelect,
) {
  const sessions = (await listClassSessionsForClass(db, enrollment.classId)).filter((session) =>
    shouldSyncEnrollmentToSession(session, enrollment.joinedAt),
  );
  for (const session of sessions) {
    await ensureSessionRosterSnapshot(db, session.id);
    await upsertSessionStudent(db, {
      classSessionId: session.id,
      studentId: enrollment.studentId,
      billingCourseId: enrollment.billingCourseId,
      source: 'enrollment',
      active: true,
    });
  }
}

async function syncEnrollmentToScheduledSessions(
  db: Database,
  enrollment: typeof schema.classEnrollments.$inferSelect,
) {
  const sessions = (await listClassSessionsForClass(db, enrollment.classId)).filter(
    (session) => session.status === 'scheduled' && session.startsAt >= enrollment.joinedAt,
  );
  for (const session of sessions) {
    await upsertSessionStudent(db, {
      classSessionId: session.id,
      studentId: enrollment.studentId,
      billingCourseId: enrollment.billingCourseId,
      source: 'enrollment',
      active: true,
    });
  }
}

export async function updateEnrollmentBillingCourse(
  db: Database,
  input: { classId: string; enrollmentId: string; billingCourseId: string },
) {
  const [enrollment] = await db
    .update(schema.classEnrollments)
    .set({ billingCourseId: input.billingCourseId })
    .where(
      and(
        eq(schema.classEnrollments.classId, input.classId),
        eq(schema.classEnrollments.id, input.enrollmentId),
      ),
    )
    .returning();
  if (enrollment) {
    await syncEnrollmentToScheduledSessions(db, enrollment);
  }
  return enrollment ?? null;
}

export async function updateEnrollmentJoinedAt(
  db: Database,
  input: { classId: string; enrollmentId: string; joinedAt: Date },
) {
  const [enrollment] = await db
    .update(schema.classEnrollments)
    .set({ joinedAt: input.joinedAt })
    .where(
      and(
        eq(schema.classEnrollments.classId, input.classId),
        eq(schema.classEnrollments.id, input.enrollmentId),
      ),
    )
    .returning();
  if (enrollment) {
    const sessions = await listClassSessionsForClass(db, input.classId);
    for (const session of sessions) {
      if (shouldSyncEnrollmentToSession(session, input.joinedAt)) {
        await ensureSessionRosterSnapshot(db, session.id);
        await upsertSessionStudent(db, {
          classSessionId: session.id,
          studentId: enrollment.studentId,
          billingCourseId: enrollment.billingCourseId,
          source: 'enrollment',
          active: true,
        });
        continue;
      }
      if (session.startsAt >= input.joinedAt) continue;
      const [attendance] = await db
        .select({ id: schema.attendanceRecords.id })
        .from(schema.attendanceRecords)
        .where(
          and(
            eq(schema.attendanceRecords.classSessionId, session.id),
            eq(schema.attendanceRecords.studentId, enrollment.studentId),
          ),
        )
        .limit(1);
      if (!attendance) {
        await removeSessionStudent(db, {
          sessionId: session.id,
          studentId: enrollment.studentId,
        });
      }
    }
  }
  return enrollment ?? null;
}

export async function removeEnrollment(
  db: Database,
  classId: string,
  enrollmentId: string,
  leftAt = new Date(),
) {
  const [current] = await db
    .select()
    .from(schema.classEnrollments)
    .where(
      and(
        eq(schema.classEnrollments.classId, classId),
        eq(schema.classEnrollments.id, enrollmentId),
      ),
    )
    .limit(1);
  if (!current) return null;
  const [enrollment] = await db
    .update(schema.classEnrollments)
    .set({ active: false, leftAt })
    .where(
      and(
        eq(schema.classEnrollments.classId, classId),
        eq(schema.classEnrollments.id, enrollmentId),
      ),
    )
    .returning();
  const futureSessions = (await listClassSessionsForClass(db, classId)).filter(
    (session) => session.status === 'scheduled' && session.startsAt >= leftAt,
  );
  for (const session of futureSessions) {
    const [attendance] = await db
      .select({ id: schema.attendanceRecords.id })
      .from(schema.attendanceRecords)
      .where(
        and(
          eq(schema.attendanceRecords.classSessionId, session.id),
          eq(schema.attendanceRecords.studentId, current.studentId),
        ),
      )
      .limit(1);
    if (!attendance) {
      await removeSessionStudent(db, {
        sessionId: session.id,
        studentId: current.studentId,
      });
    }
  }
  return enrollment ?? null;
}
