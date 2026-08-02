import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { applyLessonDelta } from './lesson.js';

type AttendanceStatus = (typeof schema.attendanceStatusEnum.enumValues)[number];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;

export type AttendanceLessonSource = {
  id: string;
  title: string;
  packageId: string | null;
  packageName: string | null;
  billingType: string;
  lessonCount: number;
  remainingLessonCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

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
      remainingLessonCount: schema.courseContracts.remainingLessonCount,
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
        eq(schema.courseContracts.status, 'active'),
        eq(schema.coursePackages.billingType, 'period'),
      ),
    );
  if (contracts.length === 0) return false;

  const valid = contracts.some(
    (contract) =>
      (!contract.startsAt || session.startsAt >= contract.startsAt) &&
      (!contract.endsAt || session.startsAt <= contract.endsAt) &&
      contract.remainingLessonCount > 0,
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

async function requireAccountBalance(
  tx: DbOrTx,
  input: { studentId: string; courseId: string; required: number },
) {
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
    throw Object.assign(new Error('该学员当前课程课时余额不足'), { statusCode: 422 });
  }
  return account;
}

function sourceIsValidAt(
  source: Pick<AttendanceLessonSource, 'startsAt' | 'endsAt'>,
  occursAt: Date,
) {
  return (
    (!source.startsAt || occursAt >= source.startsAt) &&
    (!source.endsAt || occursAt <= source.endsAt)
  );
}

export function compareAttendanceLessonSourcePriority(
  left: { billingType?: string | null; endsAt?: Date | null; createdAt: Date },
  right: { billingType?: string | null; endsAt?: Date | null; createdAt: Date },
) {
  const periodOrder =
    Number(right.billingType === 'period') - Number(left.billingType === 'period');
  if (periodOrder !== 0) return periodOrder;
  const endOrder =
    (left.endsAt?.getTime() ?? Number.POSITIVE_INFINITY) -
    (right.endsAt?.getTime() ?? Number.POSITIVE_INFINITY);
  if (endOrder !== 0) return endOrder;
  return left.createdAt.getTime() - right.createdAt.getTime();
}

async function listLessonSourcesInTx(
  db: DbOrTx,
  input: { studentId: string; courseId: string; occursAt: Date; includeEmpty?: boolean },
) {
  const rows = await db
    .select({
      id: schema.courseContracts.id,
      title: schema.courseContracts.title,
      packageId: schema.courseContracts.packageId,
      packageName: schema.coursePackages.name,
      billingType: schema.coursePackages.billingType,
      lessonCount: schema.courseContracts.lessonCount,
      remainingLessonCount: schema.courseContracts.remainingLessonCount,
      startsAt: schema.courseContracts.startsAt,
      endsAt: schema.courseContracts.endsAt,
      createdAt: schema.courseContracts.createdAt,
      status: schema.courseContracts.status,
    })
    .from(schema.courseContracts)
    .leftJoin(schema.coursePackages, eq(schema.courseContracts.packageId, schema.coursePackages.id))
    .where(
      and(
        eq(schema.courseContracts.studentId, input.studentId),
        eq(schema.courseContracts.courseId, input.courseId),
        ne(schema.courseContracts.status, 'cancelled'),
      ),
    );

  return rows
    .filter(
      (source) =>
        sourceIsValidAt(source, input.occursAt) &&
        (input.includeEmpty || (source.status === 'active' && source.remainingLessonCount > 0)),
    )
    .sort(compareAttendanceLessonSourcePriority)
    .map(
      (source) =>
        ({
          id: source.id,
          title: source.title,
          packageId: source.packageId,
          packageName: source.packageName ?? null,
          billingType: source.billingType ?? 'lesson',
          lessonCount: source.lessonCount,
          remainingLessonCount: source.remainingLessonCount,
          startsAt: source.startsAt,
          endsAt: source.endsAt,
        }) satisfies AttendanceLessonSource,
    );
}

export async function listAttendanceLessonSources(
  db: Database,
  input: { sessionId: string; studentId: string; courseId: string },
) {
  const [session] = await db
    .select({ startsAt: schema.classSessions.startsAt })
    .from(schema.classSessions)
    .where(eq(schema.classSessions.id, input.sessionId))
    .limit(1);
  if (!session) throw Object.assign(new Error('课次不存在'), { statusCode: 404 });
  return listLessonSourcesInTx(db, { ...input, occursAt: session.startsAt });
}

async function takeLessonSource(
  tx: Tx,
  input: {
    studentId: string;
    courseId: string;
    occursAt: Date;
    required: number;
    preferredCourseContractId?: string | null;
  },
) {
  await requireAccountBalance(tx, input);
  const sources = await listLessonSourcesInTx(tx, input);
  const source = input.preferredCourseContractId
    ? sources.find((item) => item.id === input.preferredCourseContractId)
    : sources.find((item) => item.remainingLessonCount >= input.required);
  if (input.preferredCourseContractId && !source) {
    throw Object.assign(new Error('所选课时包当前不可用或不在本课次有效期内'), {
      statusCode: 422,
    });
  }
  if (!source) return null;
  const [lockedSource] = await tx
    .select({ remainingLessonCount: schema.courseContracts.remainingLessonCount })
    .from(schema.courseContracts)
    .where(eq(schema.courseContracts.id, source.id))
    .limit(1)
    .for('update');
  if (!lockedSource || lockedSource.remainingLessonCount < input.required) {
    throw Object.assign(new Error(`「${source.packageName ?? source.title}」剩余课时不足`), {
      statusCode: 422,
    });
  }
  const remainingLessonCount = lockedSource.remainingLessonCount - input.required;
  await tx
    .update(schema.courseContracts)
    .set({
      remainingLessonCount,
      status: remainingLessonCount === 0 ? 'completed' : 'active',
      updatedAt: new Date(),
    })
    .where(eq(schema.courseContracts.id, source.id));
  return { ...source, remainingLessonCount };
}

async function restoreLessonSource(tx: Tx, courseContractId: string, amount: number) {
  const [source] = await tx
    .select()
    .from(schema.courseContracts)
    .where(eq(schema.courseContracts.id, courseContractId))
    .limit(1)
    .for('update');
  if (!source) return;
  await tx
    .update(schema.courseContracts)
    .set({
      remainingLessonCount: source.remainingLessonCount + amount,
      status: source.status === 'completed' ? 'active' : source.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.courseContracts.id, source.id));
}

async function enrichAttendanceRecords(
  db: DbOrTx,
  records: Array<typeof schema.attendanceRecords.$inferSelect>,
) {
  const sourceIds = Array.from(
    new Set(
      records.map((record) => record.courseContractId).filter((id): id is string => Boolean(id)),
    ),
  );
  if (sourceIds.length === 0) {
    return records.map((record) => ({ ...record, lessonSource: null }));
  }
  const sources = await db
    .select({
      id: schema.courseContracts.id,
      title: schema.courseContracts.title,
      remainingLessonCount: schema.courseContracts.remainingLessonCount,
      packageName: schema.coursePackages.name,
      billingType: schema.coursePackages.billingType,
    })
    .from(schema.courseContracts)
    .leftJoin(schema.coursePackages, eq(schema.courseContracts.packageId, schema.coursePackages.id))
    .where(inArray(schema.courseContracts.id, sourceIds));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return records.map((record) => ({
    ...record,
    lessonSource: record.courseContractId
      ? (sourceById.get(record.courseContractId) ?? null)
      : null,
  }));
}

export async function listAttendanceForSession(db: Database, sessionId: string) {
  const records = await db
    .select()
    .from(schema.attendanceRecords)
    .where(eq(schema.attendanceRecords.classSessionId, sessionId))
    .orderBy(desc(schema.attendanceRecords.createdAt));
  return enrichAttendanceRecords(db, records);
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
      courseContractId?: string | null;
    }>;
    completeSession?: boolean;
  },
) {
  const records = await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ startsAt: schema.classSessions.startsAt })
      .from(schema.classSessions)
      .where(eq(schema.classSessions.id, input.sessionId))
      .limit(1);
    if (!session) throw Object.assign(new Error('课次不存在'), { statusCode: 404 });
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
      const lessonSource =
        lessonDelta < 0
          ? await takeLessonSource(tx, {
              studentId: record.studentId,
              courseId: billingCourseId,
              occursAt: session.startsAt,
              required: -lessonDelta,
              preferredCourseContractId: record.courseContractId,
            })
          : null;
      if (periodPackage && lessonDelta < 0 && !lessonSource) {
        throw Object.assign(new Error('该学员本周期课时已用完'), { statusCode: 422 });
      }
      const [attendanceRecord] = await tx
        .insert(schema.attendanceRecords)
        .values({
          classSessionId: input.sessionId,
          studentId: record.studentId,
          courseContractId: lessonSource?.id ?? null,
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
          courseContractId: lessonSource?.id ?? null,
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
  return enrichAttendanceRecords(db, records);
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
    courseContractId?: string | null;
  },
) {
  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ startsAt: schema.classSessions.startsAt })
      .from(schema.classSessions)
      .where(eq(schema.classSessions.id, input.sessionId))
      .limit(1);
    if (!session) throw Object.assign(new Error('课次不存在'), { statusCode: 404 });
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
    const requestedSourceId =
      input.courseContractId === undefined ? existing.courseContractId : input.courseContractId;
    const allocationChanged =
      nextLessonDelta !== existing.lessonDelta ||
      (nextLessonDelta < 0 && requestedSourceId !== existing.courseContractId);
    let lessonSourceId = existing.courseContractId;
    if (allocationChanged && existing.lessonDelta < 0) {
      const restoredAmount = -existing.lessonDelta;
      if (existing.courseContractId) {
        await restoreLessonSource(tx, existing.courseContractId, restoredAmount);
      }
      await applyLessonDelta(tx, {
        studentId: input.studentId,
        courseId: input.courseId,
        type: 'adjustment',
        amount: restoredAmount,
        relatedEntityType: 'attendance_correction',
        relatedEntityId: input.sessionId,
        courseContractId: existing.courseContractId,
      });
      lessonSourceId = null;
    }
    if (allocationChanged && nextLessonDelta < 0) {
      const source = await takeLessonSource(tx, {
        studentId: input.studentId,
        courseId: input.courseId,
        occursAt: session.startsAt,
        required: -nextLessonDelta,
        preferredCourseContractId: requestedSourceId,
      });
      if (periodPackage && !source) {
        throw Object.assign(new Error('该学员本周期课时已用完'), { statusCode: 422 });
      }
      lessonSourceId = source?.id ?? null;
      await applyLessonDelta(tx, {
        studentId: input.studentId,
        courseId: input.courseId,
        type: 'consume',
        amount: nextLessonDelta,
        relatedEntityType: 'class_session',
        relatedEntityId: input.sessionId,
        courseContractId: lessonSourceId,
      });
    }
    const lessonDeltaAdjustment = nextLessonDelta - existing.lessonDelta;
    const [updated] = await tx
      .update(schema.attendanceRecords)
      .set({
        status: input.status,
        lessonDelta: nextLessonDelta,
        courseContractId: nextLessonDelta < 0 ? lessonSourceId : null,
        note: input.note ?? null,
      })
      .where(eq(schema.attendanceRecords.id, existing.id))
      .returning();

    return { attendanceRecord: updated, lessonDeltaAdjustment };
  });
  if (!result) return null;
  const [attendanceRecord] = await enrichAttendanceRecords(db, [result.attendanceRecord]);
  return { ...result, attendanceRecord: attendanceRecord! };
}
