import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export async function listTeachers(db: Database) {
  return db.select().from(schema.teachers).orderBy(desc(schema.teachers.createdAt));
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

export async function archiveTeacher(db: Database, teacherId: string) {
  return updateTeacher(db, teacherId, { status: 'archived' });
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

export async function archiveClassroom(db: Database, classroomId: string) {
  return updateClassroom(db, classroomId, { status: 'archived' });
}
