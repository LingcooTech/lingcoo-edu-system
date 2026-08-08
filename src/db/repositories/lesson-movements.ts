import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { httpError } from '../../lib/http-error.js';
import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type LessonMovementType = (typeof schema.lessonMovementTypeEnum.enumValues)[number];
type CourseContractStatus = (typeof schema.courseContractStatusEnum.enumValues)[number];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;

export function calculateLessonMovementState(
  balanceBefore: number,
  currentStatus: CourseContractStatus,
  units: number,
): { balanceAfter: number; status: CourseContractStatus } {
  if (!Number.isSafeInteger(balanceBefore) || balanceBefore < 0) {
    throw httpError(500, '课时包余额无效');
  }
  if (!Number.isSafeInteger(units) || units === 0) {
    throw httpError(422, '课时变动必须是非零整数');
  }
  const balanceAfter = balanceBefore + units;
  if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) {
    throw httpError(422, '课时包剩余课时不足');
  }
  const status: CourseContractStatus =
    balanceAfter === 0 ? 'completed' : currentStatus === 'completed' ? 'active' : currentStatus;
  return { balanceAfter, status };
}

export async function applyLessonMovement(
  tx: Tx,
  input: {
    courseContractId: string;
    studentId: string;
    operationId: string;
    type: LessonMovementType;
    units: number;
    occurredAt: Date;
    attendanceRecordId?: string | null;
    actorAccountId?: string | null;
    requestId?: string | null;
    reason: string;
    metadata?: Record<string, unknown>;
    allowInactive?: boolean;
  },
) {
  const [contract] = await tx
    .select()
    .from(schema.courseContracts)
    .where(eq(schema.courseContracts.id, input.courseContractId))
    .limit(1)
    .for('update');
  if (!contract) throw httpError(404, '课时包不存在');

  const [existing] = await tx
    .select()
    .from(schema.lessonMovements)
    .where(eq(schema.lessonMovements.operationId, input.operationId))
    .limit(1);
  if (existing) {
    if (
      existing.courseContractId !== input.courseContractId ||
      existing.studentId !== input.studentId ||
      existing.units !== input.units ||
      existing.type !== input.type
    ) {
      throw httpError(409, '课时操作标识已被其他变动使用');
    }
    return { contract, movement: existing, applied: false };
  }

  if (contract.studentId !== input.studentId) {
    throw httpError(422, '课时包不属于该学员');
  }
  if (contract.status === 'cancelled') {
    throw httpError(422, '已取消课时包不能再发生课时变动');
  }
  if (!input.allowInactive && contract.status !== 'active') {
    throw httpError(422, '课时包当前不可消费');
  }

  const balanceBefore = contract.remainingLessonCount;
  let movementState: ReturnType<typeof calculateLessonMovementState>;
  try {
    movementState = calculateLessonMovementState(balanceBefore, contract.status, input.units);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 422 && balanceBefore + input.units < 0) {
      throw httpError(422, `「${contract.title}」剩余课时不足`);
    }
    throw error;
  }
  const { balanceAfter, status: nextStatus } = movementState;
  const [updatedContract] = await tx
    .update(schema.courseContracts)
    .set({ remainingLessonCount: balanceAfter, status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.courseContracts.id, contract.id))
    .returning();

  const [movement] = await tx
    .insert(schema.lessonMovements)
    .values({
      courseContractId: contract.id,
      studentId: input.studentId,
      attendanceRecordId: input.attendanceRecordId ?? null,
      operationId: input.operationId,
      type: input.type,
      units: input.units,
      balanceBefore,
      balanceAfter,
      occurredAt: input.occurredAt,
      actorAccountId: input.actorAccountId ?? null,
      reason: input.reason,
      metadata: input.metadata ?? {},
    })
    .returning();

  await tx.insert(schema.auditLogs).values({
    actorAccountId: input.actorAccountId ?? null,
    institutionId: contract.institutionId,
    requestId: input.requestId ?? null,
    action: `lesson.movement.${input.type}`,
    resourceType: 'lesson_movement',
    resourceId: movement!.id,
    summary: input.reason.slice(0, 255),
    meta: {
      operationId: input.operationId,
      courseContractId: contract.id,
      contractNo: contract.contractNo,
      studentId: input.studentId,
      attendanceRecordId: input.attendanceRecordId ?? null,
      units: input.units,
      balanceBefore,
      balanceAfter,
      occurredAt: input.occurredAt.toISOString(),
      metadata: input.metadata ?? {},
    },
  });

  return { contract: updatedContract!, movement: movement!, applied: true };
}

export async function listLessonMovements(db: Database) {
  return db.select().from(schema.lessonMovements).orderBy(desc(schema.lessonMovements.createdAt));
}

export async function listMovementsForContracts(db: DbOrTx, contractIds: string[]) {
  if (contractIds.length === 0) return [];
  return db
    .select()
    .from(schema.lessonMovements)
    .where(inArray(schema.lessonMovements.courseContractId, contractIds))
    .orderBy(desc(schema.lessonMovements.createdAt));
}

export async function listStudentPackageBalances(
  db: DbOrTx,
  input: { studentId?: string; courseId?: string; activeOnly?: boolean } = {},
) {
  const filters = [];
  if (input.studentId) filters.push(eq(schema.courseContracts.studentId, input.studentId));
  if (input.courseId) filters.push(eq(schema.courseContracts.courseId, input.courseId));
  if (input.activeOnly) filters.push(eq(schema.courseContracts.status, 'active'));
  const rows = await db
    .select({
      id: schema.courseContracts.id,
      studentId: schema.courseContracts.studentId,
      courseId: schema.courseContracts.courseId,
      balance: schema.courseContracts.remainingLessonCount,
      status: schema.courseContracts.status,
      updatedAt: schema.courseContracts.updatedAt,
    })
    .from(schema.courseContracts)
    .where(filters.length > 0 ? and(...filters) : undefined);
  return rows;
}

export async function listPackageBalancesForStudents(db: DbOrTx, studentIds: string[]) {
  if (studentIds.length === 0) return [];
  return db
    .select({
      id: schema.courseContracts.id,
      courseContractId: schema.courseContracts.id,
      studentId: schema.courseContracts.studentId,
      courseId: schema.courseContracts.courseId,
      balance: schema.courseContracts.remainingLessonCount,
      status: schema.courseContracts.status,
      title: schema.courseContracts.title,
      lessonCount: schema.courseContracts.lessonCount,
      updatedAt: schema.courseContracts.updatedAt,
    })
    .from(schema.courseContracts)
    .where(inArray(schema.courseContracts.studentId, studentIds));
}

export async function getStudentAvailableBalance(
  db: DbOrTx,
  input: { studentId: string; courseId?: string },
) {
  const filters = [
    eq(schema.courseContracts.studentId, input.studentId),
    eq(schema.courseContracts.status, 'active'),
  ];
  if (input.courseId) filters.push(eq(schema.courseContracts.courseId, input.courseId));
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.courseContracts.remainingLessonCount}), 0)` })
    .from(schema.courseContracts)
    .where(and(...filters));
  return Number(row?.total ?? 0);
}
