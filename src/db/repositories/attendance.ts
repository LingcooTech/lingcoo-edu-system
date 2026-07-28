import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { applyLessonDelta } from './lesson.js';

type AttendanceStatus = (typeof schema.attendanceStatusEnum.enumValues)[number];

function lessonDeltaForStatus(
  status: AttendanceStatus,
  options: { deductLesson?: boolean; lessonUnits?: number; periodPackage?: boolean } = {},
): number {
  if (status === 'absent' && options.deductLesson === false && !options.periodPackage) {
    return 0;
  }
  if (
    status === 'present' ||
    status === 'late' ||
    status === 'absent' ||
    status === 'makeup' ||
    (status === 'leave' && options.periodPackage)
  ) {
    return -(options.lessonUnits ?? 1);
  }
  return 0;
}

async function periodPackageForSession(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  input: { sessionId: string; studentId: string; courseId: string },
) {
  const [session] = await tx
    .select({ startsAt: schema.classSessions.startsAt })
    .from(schema.classSessions)
    .where(eq(schema.classSessions.id, input.sessionId))
    .limit(1);
  if (!session) {
    throw Object.assign(new Error('课次不存在'), { statusCode: 404 });
  }

  const contracts = await tx
    .select({
      startsAt: schema.courseContracts.startsAt,
      endsAt: schema.courseContracts.endsAt,
      billingType: schema.coursePackages.billingType,
    })
    .from(schema.courseContracts)
    .innerJoin(
      schema.coursePackages,
      eq(schema.courseContracts.packageId, schema.coursePackages.id),
    )
    .where(
      and(
        eq(schema.courseContracts.studentId, input.studentId),
        eq(schema.courseContracts.courseId, input.courseId),
        ne(schema.courseContracts.status, 'cancelled'),
        eq(schema.coursePackages.billingType, 'period'),
      ),
    );
  if (contracts.length === 0) return false;

  const valid = contracts.some(
    (contract) =>
      (!contract.startsAt || session.startsAt >= contract.startsAt) &&
      (!contract.endsAt || session.startsAt <= contract.endsAt),
  );
  if (valid) return true;

  const ordinaryContracts = await tx
    .select({
      startsAt: schema.courseContracts.startsAt,
      endsAt: schema.courseContracts.endsAt,
      billingType: schema.coursePackages.billingType,
    })
    .from(schema.courseContracts)
    .leftJoin(schema.coursePackages, eq(schema.courseContracts.packageId, schema.coursePackages.id))
    .where(
      and(
        eq(schema.courseContracts.studentId, input.studentId),
        eq(schema.courseContracts.courseId, input.courseId),
        eq(schema.courseContracts.status, 'active'),
      ),
    );
  const hasValidOrdinaryContract = ordinaryContracts.some(
    (contract) =>
      contract.billingType !== 'period' &&
      (!contract.startsAt || session.startsAt >= contract.startsAt) &&
      (!contract.endsAt || session.startsAt <= contract.endsAt),
  );
  if (hasValidOrdinaryContract) return false;

  throw Object.assign(new Error('该学员的周期卡不在本课次有效期内'), { statusCode: 422 });
}

async function ensurePeriodBalance(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  input: { studentId: string; courseId: string; required: number },
) {
  if (input.required <= 0) return;
  const [account] = await tx
    .select()
    .from(schema.lessonAccounts)
    .where(
      and(
        eq(schema.lessonAccounts.studentId, input.studentId),
        eq(schema.lessonAccounts.courseId, input.courseId),
      ),
    )
    .limit(1)
    .for('update');
  if (!account || account.balance < input.required) {
    throw Object.assign(new Error('该学员本周期课时已用完'), { statusCode: 422 });
  }
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
      courseId: schema.courses.id,
      className: schema.classes.name,
      courseName: schema.courses.name,
    })
    .from(schema.attendanceRecords)
    .innerJoin(
      schema.classSessions,
      eq(schema.attendanceRecords.classSessionId, schema.classSessions.id),
    )
    .leftJoin(schema.classes, eq(schema.classSessions.classId, schema.classes.id))
    .innerJoin(schema.courses, eq(schema.classSessions.courseId, schema.courses.id))
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
    records: Array<{
      studentId: string;
      status: AttendanceStatus;
      note?: string;
      courseId?: string;
      deductLesson?: boolean;
      lessonUnits?: number;
    }>;
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

      const billingCourseId = record.courseId ?? input.courseId;
      const periodPackage = await periodPackageForSession(tx, {
        sessionId: input.sessionId,
        studentId: record.studentId,
        courseId: billingCourseId,
      });
      const lessonDelta = lessonDeltaForStatus(record.status, {
        deductLesson: record.deductLesson,
        lessonUnits: record.lessonUnits,
        periodPackage,
      });
      if (periodPackage && lessonDelta < 0) {
        await ensurePeriodBalance(tx, {
          studentId: record.studentId,
          courseId: billingCourseId,
          required: -lessonDelta,
        });
      }
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
          courseId: billingCourseId,
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

export async function updateAttendanceRecord(
  db: Database,
  input: {
    sessionId: string;
    studentId: string;
    status: AttendanceStatus;
    note?: string | null;
    courseId: string;
    deductLesson?: boolean;
    lessonUnits?: number;
  },
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.attendanceRecords)
      .where(
        and(
          eq(schema.attendanceRecords.classSessionId, input.sessionId),
          eq(schema.attendanceRecords.studentId, input.studentId),
        ),
      )
      .limit(1)
      .for('update');
    if (!existing) {
      return null;
    }

    const periodPackage = await periodPackageForSession(tx, {
      sessionId: input.sessionId,
      studentId: input.studentId,
      courseId: input.courseId,
    });
    const nextLessonDelta = lessonDeltaForStatus(input.status, {
      deductLesson: input.deductLesson,
      lessonUnits: input.lessonUnits,
      periodPackage,
    });
    const lessonDeltaAdjustment = nextLessonDelta - existing.lessonDelta;
    if (periodPackage && lessonDeltaAdjustment < 0) {
      await ensurePeriodBalance(tx, {
        studentId: input.studentId,
        courseId: input.courseId,
        required: -lessonDeltaAdjustment,
      });
    }
    const [updated] = await tx
      .update(schema.attendanceRecords)
      .set({
        status: input.status,
        lessonDelta: nextLessonDelta,
        note: input.note ?? null,
      })
      .where(eq(schema.attendanceRecords.id, existing.id))
      .returning();

    if (lessonDeltaAdjustment !== 0) {
      await applyLessonDelta(tx, {
        studentId: input.studentId,
        courseId: input.courseId,
        type: 'consume',
        amount: lessonDeltaAdjustment,
        relatedEntityType: 'class_session',
        relatedEntityId: input.sessionId,
      });
    }

    return { attendanceRecord: updated, lessonDeltaAdjustment };
  });
}
