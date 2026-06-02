import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export async function listTeachers(db: Database) {
  return db.select().from(schema.teachers).orderBy(desc(schema.teachers.createdAt));
}

export async function findTeacher(db: Database, teacherId: string | null) {
  if (!teacherId) {
    return null;
  }
  const [teacher] = await db
    .select()
    .from(schema.teachers)
    .where(eq(schema.teachers.id, teacherId))
    .limit(1);
  return teacher ?? null;
}

export async function createTeacher(db: Database, values: typeof schema.teachers.$inferInsert) {
  const [teacher] = await db.insert(schema.teachers).values(values).returning();
  return teacher;
}

export async function updateTeacher(
  db: Database,
  teacherId: string,
  patch: Partial<typeof schema.teachers.$inferInsert>,
) {
  const [teacher] = await db
    .update(schema.teachers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.teachers.id, teacherId))
    .returning();
  return teacher ?? null;
}

export async function deleteTeacher(db: Database, teacherId: string) {
  const [teacher] = await db
    .delete(schema.teachers)
    .where(eq(schema.teachers.id, teacherId))
    .returning();
  return teacher ?? null;
}

export async function listClassrooms(db: Database) {
  return db.select().from(schema.classrooms).orderBy(desc(schema.classrooms.createdAt));
}

export async function createClassroom(db: Database, values: typeof schema.classrooms.$inferInsert) {
  const [classroom] = await db.insert(schema.classrooms).values(values).returning();
  return classroom;
}

export async function updateClassroom(
  db: Database,
  classroomId: string,
  patch: Partial<typeof schema.classrooms.$inferInsert>,
) {
  const [classroom] = await db
    .update(schema.classrooms)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.classrooms.id, classroomId))
    .returning();
  return classroom ?? null;
}

export async function deleteClassroom(db: Database, classroomId: string) {
  const [classroom] = await db
    .delete(schema.classrooms)
    .where(eq(schema.classrooms.id, classroomId))
    .returning();
  return classroom ?? null;
}
