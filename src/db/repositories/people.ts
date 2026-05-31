import { and, desc, eq } from 'drizzle-orm';

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
