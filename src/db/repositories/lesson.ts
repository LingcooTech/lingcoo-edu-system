import { and, desc, eq, isNotNull, sum } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;

// Compatibility name for callers that have not yet renamed their response
// field. Each row is now one concrete package, never a course-level balance.
export async function listLessonAccounts(db: Database, institutionId?: string | null) {
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
    .where(institutionId ? eq(schema.courseContracts.institutionId, institutionId) : undefined)
    .orderBy(desc(schema.courseContracts.createdAt));
}

export async function listLessonTransactions(db: Database, institutionId?: string | null) {
  const movements = await db
    .select({ movement: schema.lessonMovements })
    .from(schema.lessonMovements)
    .innerJoin(
      schema.courseContracts,
      eq(schema.lessonMovements.courseContractId, schema.courseContracts.id),
    )
    .where(institutionId ? eq(schema.courseContracts.institutionId, institutionId) : undefined)
    .orderBy(desc(schema.lessonMovements.createdAt));
  return movements.map(({ movement }) => ({
    id: movement.id,
    lessonAccountId: movement.courseContractId,
    studentId: movement.studentId,
    courseContractId: movement.courseContractId,
    type:
      movement.type === 'grant'
        ? ('purchase' as const)
        : movement.type === 'consume'
          ? ('consume' as const)
          : movement.type === 'refund'
            ? ('refund' as const)
            : ('adjustment' as const),
    amount: movement.units,
    balanceBefore: movement.balanceBefore,
    balanceAfter: movement.balanceAfter,
    relatedEntityType: movement.attendanceRecordId ? 'attendance_record' : 'course_contract',
    relatedEntityId: movement.attendanceRecordId ?? movement.courseContractId,
    operationId: movement.operationId,
    occurredAt: movement.occurredAt,
    reason: movement.reason,
    createdAt: movement.createdAt,
  }));
}

export async function getConsumedLessonCount(
  tx: DbOrTx,
  input: { studentId: string; courseId: string },
) {
  const [result] = await tx
    .select({ total: sum(schema.lessonMovements.units).mapWith(Number) })
    .from(schema.lessonMovements)
    .innerJoin(
      schema.courseContracts,
      eq(schema.lessonMovements.courseContractId, schema.courseContracts.id),
    )
    .where(
      and(
        eq(schema.lessonMovements.studentId, input.studentId),
        eq(schema.courseContracts.courseId, input.courseId),
        isNotNull(schema.lessonMovements.attendanceRecordId),
      ),
    );
  return Math.max(0, -(result?.total ?? 0));
}
