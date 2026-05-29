import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export async function listTeachers(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.teachers)
    .where(eq(schema.teachers.tenantId, tenantId))
    .orderBy(desc(schema.teachers.createdAt));
}

export async function createTeacher(db: Database, values: typeof schema.teachers.$inferInsert) {
  const [teacher] = await db.insert(schema.teachers).values(values).returning();
  return teacher;
}

export async function listClassrooms(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.classrooms)
    .where(eq(schema.classrooms.tenantId, tenantId))
    .orderBy(desc(schema.classrooms.createdAt));
}

export async function createClassroom(db: Database, values: typeof schema.classrooms.$inferInsert) {
  const [classroom] = await db.insert(schema.classrooms).values(values).returning();
  return classroom;
}
