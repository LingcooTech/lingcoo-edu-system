import { and, desc, eq, ne } from 'drizzle-orm';

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

export async function deleteGuardianIfOrphan(db: Database, guardianId: string) {
  return db.transaction(async (tx) => {
    const [linkedAccount] = await tx
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.guardianId, guardianId))
      .limit(1);
    if (linkedAccount) {
      return null;
    }

    const [linkedStudent] = await tx
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.guardianId, guardianId))
      .limit(1);
    if (linkedStudent) {
      return null;
    }

    const [linkedStudentGuardian] = await tx
      .select({ guardianId: schema.studentGuardians.guardianId })
      .from(schema.studentGuardians)
      .where(eq(schema.studentGuardians.guardianId, guardianId))
      .limit(1);
    if (linkedStudentGuardian) {
      return null;
    }

    const [guardian] = await tx
      .delete(schema.guardians)
      .where(eq(schema.guardians.id, guardianId))
      .returning();
    return guardian ?? null;
  });
}

export async function findStudentForGuardian(
  db: Database,
  input: { guardianId: string; name: string },
) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.guardianId, input.guardianId),
        eq(schema.students.name, input.name),
        ne(schema.students.status, 'archived'),
      ),
    )
    .limit(1);
  return student ?? null;
}

export async function findStudent(db: Database, studentId: string) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .limit(1);
  return student ?? null;
}

type StudentListScope = 'all' | 'current' | 'archived';

export async function listStudents(db: Database, options: { scope?: StudentListScope } = {}) {
  if (options.scope === 'current') {
    return db
      .select()
      .from(schema.students)
      .where(ne(schema.students.status, 'archived'))
      .orderBy(desc(schema.students.createdAt));
  }

  if (options.scope === 'archived') {
    return db
      .select()
      .from(schema.students)
      .where(eq(schema.students.status, 'archived'))
      .orderBy(desc(schema.students.updatedAt));
  }

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

export async function archiveStudent(db: Database, studentId: string) {
  const [student] = await db
    .update(schema.students)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(schema.students.id, studentId))
    .returning();
  return student ?? null;
}

export async function hardDeleteStudent(db: Database, studentId: string) {
  return db.transaction(async (tx) => {
    const orders = await tx
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(eq(schema.orders.studentId, studentId));

    const courseContracts = await tx
      .select({ id: schema.courseContracts.id })
      .from(schema.courseContracts)
      .where(eq(schema.courseContracts.studentId, studentId));

    for (const order of orders) {
      await tx.delete(schema.refundRequests).where(eq(schema.refundRequests.orderId, order.id));
    }

    for (const contract of courseContracts) {
      await tx
        .delete(schema.courseContractPaymentRecords)
        .where(eq(schema.courseContractPaymentRecords.courseContractId, contract.id));
    }

    await tx.delete(schema.orders).where(eq(schema.orders.studentId, studentId));
    await tx.delete(schema.courseContracts).where(eq(schema.courseContracts.studentId, studentId));

    const [student] = await tx
      .delete(schema.students)
      .where(eq(schema.students.id, studentId))
      .returning();

    return student ?? null;
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
