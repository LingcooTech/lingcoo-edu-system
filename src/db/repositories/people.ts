import { and, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export async function listGuardians(db: Database) {
  return db.select().from(schema.guardians).orderBy(desc(schema.guardians.createdAt));
}

export async function findGuardianByPhone(db: Database, phone: string) {
  const [guardian] = await db
    .select()
    .from(schema.guardians)
    .where(eq(schema.guardians.phone, phone))
    .limit(1);
  return guardian ?? null;
}

export async function createGuardian(db: Database, values: typeof schema.guardians.$inferInsert) {
  const [guardian] = await db.insert(schema.guardians).values(values).returning();
  return guardian;
}

export async function updateGuardian(
  db: Database,
  guardianId: string,
  patch: Partial<typeof schema.guardians.$inferInsert>,
) {
  const [guardian] = await db
    .update(schema.guardians)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.guardians.id, guardianId))
    .returning();
  return guardian ?? null;
}

export async function findStudentForGuardian(db: Database, input: { guardianId: string; name: string }) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(and(eq(schema.students.guardianId, input.guardianId), eq(schema.students.name, input.name)))
    .limit(1);
  return student ?? null;
}

export async function listStudents(db: Database) {
  return db.select().from(schema.students).orderBy(desc(schema.students.createdAt));
}

export async function createStudent(db: Database, values: typeof schema.students.$inferInsert) {
  const [student] = await db.insert(schema.students).values(values).returning();
  return student;
}

export async function updateStudent(
  db: Database,
  studentId: string,
  patch: Partial<typeof schema.students.$inferInsert>,
) {
  const [student] = await db
    .update(schema.students)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.students.id, studentId))
    .returning();
  return student ?? null;
}

export async function deleteStudent(db: Database, studentId: string) {
  const [student] = await db
    .update(schema.students)
    .set({ status: 'inactive', updatedAt: new Date() })
    .where(eq(schema.students.id, studentId))
    .returning();
  return student ?? null;
}

export async function purgeStudent(db: Database, studentId: string) {
  return db.transaction(async (tx) => {
    const [student] = await tx
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);

    if (!student) {
      return null;
    }

    const studentOrders = await tx
      .select({ id: schema.orders.id, orderNo: schema.orders.orderNo })
      .from(schema.orders)
      .where(eq(schema.orders.studentId, studentId));
    const orderIds = studentOrders.map((order) => order.id);
    const orderNos = studentOrders.map((order) => order.orderNo);

    const deletedContracts = await tx
      .delete(schema.courseContracts)
      .where(eq(schema.courseContracts.studentId, studentId))
      .returning({ id: schema.courseContracts.id });

    let deletedSettlementBatchOrderCount = 0;
    let deletedRefundRequestCount = 0;
    let deletedPaymentCount = 0;
    let deletedOrderCount = 0;

    if (orderIds.length > 0) {
      const deletedSettlementBatchOrders = await tx
        .delete(schema.settlementBatchOrders)
        .where(inArray(schema.settlementBatchOrders.orderId, orderIds))
        .returning({ settlementBatchId: schema.settlementBatchOrders.settlementBatchId });
      deletedSettlementBatchOrderCount = deletedSettlementBatchOrders.length;

      const affectedSettlementBatchIds = Array.from(
        new Set(deletedSettlementBatchOrders.map((row) => row.settlementBatchId)),
      );
      for (const settlementBatchId of affectedSettlementBatchIds) {
        const remainingRows = await tx
          .select({ amount: schema.settlementBatchOrders.amount })
          .from(schema.settlementBatchOrders)
          .where(eq(schema.settlementBatchOrders.settlementBatchId, settlementBatchId));
        await tx
          .update(schema.settlementBatches)
          .set({
            orderCount: remainingRows.length,
            totalAmount: remainingRows.reduce((sum, row) => sum + row.amount, 0),
            updatedAt: new Date(),
          })
          .where(eq(schema.settlementBatches.id, settlementBatchId));
      }

      const deletedRefundRequests = await tx
        .delete(schema.refundRequests)
        .where(inArray(schema.refundRequests.orderId, orderIds))
        .returning({ id: schema.refundRequests.id });
      deletedRefundRequestCount = deletedRefundRequests.length;

      if (orderNos.length > 0) {
        const deletedPayments = await tx
          .delete(schema.payments)
          .where(inArray(schema.payments.orderNo, orderNos))
          .returning({ id: schema.payments.id });
        deletedPaymentCount = deletedPayments.length;
      }

      const deletedOrders = await tx
        .delete(schema.orders)
        .where(inArray(schema.orders.id, orderIds))
        .returning({ id: schema.orders.id });
      deletedOrderCount = deletedOrders.length;
    }

    const [deletedStudent] = await tx
      .delete(schema.students)
      .where(eq(schema.students.id, studentId))
      .returning();

    return {
      student: deletedStudent ?? student,
      deleted: {
        orders: deletedOrderCount,
        courseContracts: deletedContracts.length,
        settlementBatchOrders: deletedSettlementBatchOrderCount,
        refundRequests: deletedRefundRequestCount,
        payments: deletedPaymentCount,
      },
    };
  });
}

export async function requireStudent(db: Database, studentId: string) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .limit(1);
  if (!student) {
    throw notFound('Student not found');
  }
  return student;
}

export async function findGuardian(db: Database, guardianId: string | null) {
  if (!guardianId) {
    return null;
  }
  const [guardian] = await db
    .select()
    .from(schema.guardians)
    .where(eq(schema.guardians.id, guardianId))
    .limit(1);
  return guardian ?? null;
}
