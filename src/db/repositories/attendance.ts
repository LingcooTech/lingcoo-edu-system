import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { applyLessonMovement } from './lesson-movements.js';

type AttendanceStatus = (typeof schema.attendanceStatusEnum.enumValues)[number];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;

export type AttendanceLessonSource = {
  id: string;
  studentId: string;
  courseId: string;
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
  input: {
    sessionId: string;
    studentId: string;
    preferredCourseContractId?: string | null;
  },
) {
  const [session] = await tx
    .select({ startsAt: schema.classSessions.startsAt })
    .from(schema.classSessions)
    .where(eq(schema.classSessions.id, input.sessionId))
    .limit(1);
  if (!session) {
    throw Object.assign(new Error('课次不存在'), { statusCode: 404 });
  }

  if (input.preferredCourseContractId) {
    const [preferred] = await tx
      .select({
        startsAt: schema.courseContracts.startsAt,
        endsAt: schema.courseContracts.endsAt,
        remainingLessonCount: schema.courseContracts.remainingLessonCount,
        billingType: schema.coursePackages.billingType,
      })
      .from(schema.courseContracts)
      .leftJoin(
        schema.coursePackages,
        eq(schema.courseContracts.packageId, schema.coursePackages.id),
      )
      .where(
        and(
          eq(schema.courseContracts.id, input.preferredCourseContractId),
          eq(schema.courseContracts.studentId, input.studentId),
        ),
      )
      .limit(1);
    if (preferred?.billingType !== 'period') return false;
    if (
      (preferred.startsAt && session.startsAt < preferred.startsAt) ||
      (preferred.endsAt && session.startsAt > preferred.endsAt) ||
      preferred.remainingLessonCount <= 0
    ) {
      throw Object.assign(new Error('所选周期卡不在本课次有效期内或课时已用完'), {
        statusCode: 422,
      });
    }
    return true;
  }

  return false;
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
  input: { studentId: string; occursAt: Date; includeEmpty?: boolean },
) {
  const rows = await db
    .select({
      id: schema.courseContracts.id,
      studentId: schema.courseContracts.studentId,
      courseId: schema.courseContracts.courseId,
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
          studentId: source.studentId,
          courseId: source.courseId,
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
  input: { sessionId: string; studentId: string },
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
    occursAt: Date;
    required: number;
    preferredCourseContractId?: string | null;
  },
) {
  if (!input.preferredCourseContractId) {
    throw Object.assign(new Error('请先为该学员明确选择扣课课时包'), { statusCode: 422 });
  }
  const [source] = await tx
    .select()
    .from(schema.courseContracts)
    .where(eq(schema.courseContracts.id, input.preferredCourseContractId))
    .limit(1)
    .for('update');
  if (
    !source ||
    source.studentId !== input.studentId ||
    source.status !== 'active' ||
    !sourceIsValidAt(source, input.occursAt)
  ) {
    throw Object.assign(new Error('所选课时包不属于该学员、不可用或不在本课次有效期内'), {
      statusCode: 422,
    });
  }
  if (source.remainingLessonCount < input.required) {
    throw Object.assign(new Error(`「${source.title}」剩余课时不足`), {
      statusCode: 422,
    });
  }
  const [coursePackage] = source.packageId
    ? await tx
        .select({ name: schema.coursePackages.name, billingType: schema.coursePackages.billingType })
        .from(schema.coursePackages)
        .where(eq(schema.coursePackages.id, source.packageId))
        .limit(1)
    : [];
  return {
    ...source,
    packageName: coursePackage?.name ?? null,
    billingType: coursePackage?.billingType ?? 'lesson',
  };
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
      lessonCount: schema.courseContracts.lessonCount,
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
  const records = await db
    .select({
      id: schema.attendanceRecords.id,
      studentId: schema.attendanceRecords.studentId,
      status: schema.attendanceRecords.status,
      lessonDelta: schema.attendanceRecords.lessonDelta,
      note: schema.attendanceRecords.note,
      courseContractId: schema.attendanceRecords.courseContractId,
      createdAt: schema.attendanceRecords.createdAt,
      sessionId: schema.classSessions.id,
      startsAt: schema.classSessions.startsAt,
      topic: schema.classSessions.topic,
      courseId: schema.courses.id,
      className: schema.classes.name,
      courseName: schema.courses.name,
      contractTitle: schema.courseContracts.title,
      packageName: schema.coursePackages.name,
      billingType: schema.coursePackages.billingType,
    })
    .from(schema.attendanceRecords)
    .innerJoin(
      schema.classSessions,
      eq(schema.attendanceRecords.classSessionId, schema.classSessions.id),
    )
    .leftJoin(schema.classes, eq(schema.classSessions.classId, schema.classes.id))
    .innerJoin(schema.courses, eq(schema.classSessions.courseId, schema.courses.id))
    .leftJoin(
      schema.courseContracts,
      eq(schema.attendanceRecords.courseContractId, schema.courseContracts.id),
    )
    .leftJoin(schema.coursePackages, eq(schema.courseContracts.packageId, schema.coursePackages.id))
    .where(inArray(schema.attendanceRecords.studentId, studentIds))
    .orderBy(desc(schema.classSessions.startsAt));

  const contractIds = Array.from(
    new Set(
      records.map((record) => record.courseContractId).filter((id): id is string => Boolean(id)),
    ),
  );
  if (contractIds.length === 0) {
    return records.map((record) => ({ ...record, lessonCount: null, balanceAfter: null }));
  }

  const [contracts, transactions] = await Promise.all([
    db
      .select({
        id: schema.courseContracts.id,
        lessonCount: schema.courseContracts.lessonCount,
      })
      .from(schema.courseContracts)
      .where(inArray(schema.courseContracts.id, contractIds)),
    db
      .select({
        attendanceRecordId: schema.lessonMovements.attendanceRecordId,
        courseContractId: schema.lessonMovements.courseContractId,
        units: schema.lessonMovements.units,
        balanceAfter: schema.lessonMovements.balanceAfter,
        createdAt: schema.lessonMovements.createdAt,
      })
      .from(schema.lessonMovements)
      .where(inArray(schema.lessonMovements.courseContractId, contractIds))
      .orderBy(desc(schema.lessonMovements.createdAt)),
  ]);
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const transactionByAttendance = new Map<string, (typeof transactions)[number]>();
  for (const transaction of transactions) {
    if (!transaction.attendanceRecordId) continue;
    const key = `${transaction.attendanceRecordId}:${transaction.courseContractId}`;
    if (!transactionByAttendance.has(key)) transactionByAttendance.set(key, transaction);
  }

  return records.map((record) => {
    const contract = record.courseContractId ? contractById.get(record.courseContractId) : null;
    const transaction = record.courseContractId
      ? transactionByAttendance.get(
          `${record.id}:${record.courseContractId}`,
        )
      : null;
    return {
      ...record,
      lessonCount: contract?.lessonCount ?? null,
      balanceAfter: record.lessonDelta < 0 ? (transaction?.balanceAfter ?? null) : null,
    };
  });
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
    actorAccountId?: string | null;
    requestId?: string | null;
  },
) {
  const records = await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ startsAt: schema.classSessions.startsAt })
      .from(schema.classSessions)
      .where(eq(schema.classSessions.id, input.sessionId))
      .limit(1)
      .for('update');
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
        .limit(1)
        .for('update');
      if (existing) {
        created.push(existing);
        continue;
      }

      const periodPackage = await periodPackageForSession(tx, {
        sessionId: input.sessionId,
        studentId: record.studentId,
        preferredCourseContractId: record.courseContractId,
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
              occursAt: session.startsAt,
              required: -lessonDelta,
              preferredCourseContractId: record.courseContractId,
            })
          : null;
      if (lessonDelta < 0 && !lessonSource) {
        throw Object.assign(
          new Error(periodPackage ? '该学员本周期课时已用完' : '该学员当前课程无可用课时包'),
          { statusCode: 422 },
        );
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

      if (lessonDelta < 0) {
        await applyLessonMovement(tx, {
          courseContractId: lessonSource!.id,
          studentId: record.studentId,
          operationId: `attendance:${attendanceRecord.id}:r1:consume`,
          type: 'consume',
          units: lessonDelta,
          occurredAt: session.startsAt,
          attendanceRecordId: attendanceRecord.id,
          actorAccountId: input.actorAccountId,
          requestId: input.requestId,
          reason: `签到扣课：${record.status}`,
          metadata: { classSessionId: input.sessionId },
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
    actorAccountId?: string | null;
    requestId?: string | null;
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

    const requestedSourceId =
      input.courseContractId === undefined ? existing.courseContractId : input.courseContractId;
    const periodPackage = await periodPackageForSession(tx, {
      sessionId: input.sessionId,
      studentId: input.studentId,
      preferredCourseContractId: requestedSourceId,
    });
    const nextLessonDelta = lessonDeltaForStatus(input.status, {
      deductLesson: input.deductLesson,
      lessonUnits: input.lessonUnits,
      periodPackage,
    });
    const lessonDeltaChanged = nextLessonDelta !== existing.lessonDelta;
    const sourceChanged = nextLessonDelta < 0 && requestedSourceId !== existing.courseContractId;
    const allocationChanged = lessonDeltaChanged || sourceChanged;
    let lessonSourceId = existing.courseContractId;
    if (allocationChanged && existing.lessonDelta < 0 && !existing.courseContractId) {
      throw Object.assign(new Error('历史扣课缺少课时包归属，请先完成数据核对'), {
        statusCode: 409,
      });
    }
    if (allocationChanged) {
      const contractIds = [existing.courseContractId, nextLessonDelta < 0 ? requestedSourceId : null]
        .filter((id): id is string => Boolean(id))
        .sort();
      for (const contractId of Array.from(new Set(contractIds))) {
        await tx
          .select({ id: schema.courseContracts.id })
          .from(schema.courseContracts)
          .where(eq(schema.courseContracts.id, contractId))
          .limit(1)
          .for('update');
      }
    }
    const nextRevision = existing.revision + 1;
    if (allocationChanged && existing.lessonDelta < 0) {
      const restoredAmount = -existing.lessonDelta;
      await applyLessonMovement(tx, {
        courseContractId: existing.courseContractId!,
        studentId: input.studentId,
        operationId: `attendance:${existing.id}:r${nextRevision}:reversal`,
        type: 'reversal',
        units: restoredAmount,
        occurredAt: session.startsAt,
        attendanceRecordId: existing.id,
        actorAccountId: input.actorAccountId,
        requestId: input.requestId,
        reason: `签到更正冲正：${existing.status} -> ${input.status}`,
        metadata: { classSessionId: input.sessionId, reversedRevision: existing.revision },
        allowInactive: true,
      });
      lessonSourceId = null;
    }
    if (allocationChanged && nextLessonDelta < 0) {
      const source = await takeLessonSource(tx, {
        studentId: input.studentId,
        occursAt: session.startsAt,
        required: -nextLessonDelta,
        preferredCourseContractId: requestedSourceId,
      });
      if (!source) {
        throw Object.assign(
          new Error(periodPackage ? '该学员本周期课时已用完' : '该学员当前课程无可用课时包'),
          { statusCode: 422 },
        );
      }
      lessonSourceId = source?.id ?? null;
      await applyLessonMovement(tx, {
        courseContractId: lessonSourceId!,
        studentId: input.studentId,
        operationId: `attendance:${existing.id}:r${nextRevision}:consume`,
        type: 'consume',
        units: nextLessonDelta,
        occurredAt: session.startsAt,
        attendanceRecordId: existing.id,
        actorAccountId: input.actorAccountId,
        requestId: input.requestId,
        reason: `签到更正扣课：${existing.status} -> ${input.status}`,
        metadata: { classSessionId: input.sessionId },
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
        revision: nextRevision,
        updatedAt: new Date(),
      })
      .where(eq(schema.attendanceRecords.id, existing.id))
      .returning();

    return { attendanceRecord: updated, lessonDeltaAdjustment };
  });
  if (!result) return null;
  const [attendanceRecord] = await enrichAttendanceRecords(db, [result.attendanceRecord]);
  return { ...result, attendanceRecord: attendanceRecord! };
}
