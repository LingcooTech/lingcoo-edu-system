import { and, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { applyLessonDelta } from './lesson.js';

type AttendanceStatus = (typeof schema.attendanceStatusEnum.enumValues)[number];

function lessonDeltaForStatus(status: AttendanceStatus): number {
  if (status === 'present' || status === 'absent' || status === 'makeup') {
    return -1;
  }
  return 0;
}

export async function listAttendanceForSession(db: Database, sessionId: string) {
  return db
    .select()
    .from(schema.attendanceRecords)
    .where(eq(schema.attendanceRecords.classSessionId, sessionId))
    .orderBy(desc(schema.attendanceRecords.createdAt));
}

/**
 * Attendance history for a set of students, enriched with the session time /
 * topic and the course + class names — drives the parent's "签到记录" view.
 */
export async function listAttendanceForStudents(db: Database, studentIds: string[]) {
  if (studentIds.length === 0) {
    return [];
  }
  return db
    .select({
      id: schema.attendanceRecords.id,
      studentId: schema.attendanceRecords.studentId,
      status: schema.attendanceRecords.status,
      lessonDelta: schema.attendanceRecords.lessonDelta,
      note: schema.attendanceRecords.note,
      createdAt: schema.attendanceRecords.createdAt,
      sessionId: schema.classSessions.id,
      startsAt: schema.classSessions.startsAt,
      topic: schema.classSessions.topic,
      className: schema.classes.name,
      courseName: schema.courses.name,
    })
    .from(schema.attendanceRecords)
    .innerJoin(
      schema.classSessions,
      eq(schema.attendanceRecords.classSessionId, schema.classSessions.id),
    )
    .innerJoin(schema.classes, eq(schema.classSessions.classId, schema.classes.id))
    .innerJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .where(inArray(schema.attendanceRecords.studentId, studentIds))
    .orderBy(desc(schema.classSessions.startsAt));
}

/**
 * Records attendance for a session in one transaction:
 * - existing session+student rows are returned as-is and never re-deduct
 * - writes attendance rows
 * - for present/absent/makeup, consumes one lesson (signed -1) from the
 *   student's account on the class's course, writing a lesson transaction
 * - marks the session completed
 */
export async function recordAttendance(
  db: Database,
  input: {
    sessionId: string;
    courseId: string;
    records: Array<{ studentId: string; status: AttendanceStatus; note?: string }>;
    completeSession?: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const created: Array<typeof schema.attendanceRecords.$inferSelect> = [];

    for (const record of input.records) {
      const [existing] = await tx
        .select()
        .from(schema.attendanceRecords)
        .where(
          and(
            eq(schema.attendanceRecords.classSessionId, input.sessionId),
            eq(schema.attendanceRecords.studentId, record.studentId),
          ),
        )
        .limit(1);
      if (existing) {
        created.push(existing);
        continue;
      }

      const lessonDelta = lessonDeltaForStatus(record.status);
      const [attendanceRecord] = await tx
        .insert(schema.attendanceRecords)
        .values({
          classSessionId: input.sessionId,
          studentId: record.studentId,
          status: record.status,
          lessonDelta,
          note: record.note,
        })
        .returning();
      created.push(attendanceRecord);

      if (lessonDelta !== 0) {
        await applyLessonDelta(tx, {
          studentId: record.studentId,
          courseId: input.courseId,
          type: 'consume',
          amount: lessonDelta,
          relatedEntityType: 'class_session',
          relatedEntityId: input.sessionId,
        });
      }
    }

    if (input.completeSession ?? true) {
      await tx
        .update(schema.classSessions)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(schema.classSessions.id, input.sessionId));
    }

    return created;
  });
}
