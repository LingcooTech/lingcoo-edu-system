import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export async function listTeachers(db: Database) {
  return db
    .select()
    .from(schema.teachers)
    .orderBy(
      desc(schema.teachers.isTrialConsultant),
      desc(schema.teachers.isPinned),
      desc(schema.teachers.createdAt),
    );
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

export async function findTeachers(db: Database, teacherIds: string[]) {
  const ids = Array.from(new Set(teacherIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const teachers = await db.select().from(schema.teachers).where(inArray(schema.teachers.id, ids));
  const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  return ids.flatMap((id) => {
    const teacher = teacherById.get(id);
    return teacher ? [teacher] : [];
  });
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

export async function setTrialConsultant(db: Database, teacherId: string) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(schema.teachers)
      .where(eq(schema.teachers.id, teacherId))
      .limit(1);
    if (!target?.institutionId) {
      return null;
    }
    await tx
      .update(schema.teachers)
      .set({ isTrialConsultant: false, updatedAt: new Date() })
      .where(
        and(
          eq(schema.teachers.institutionId, target.institutionId),
          eq(schema.teachers.isTrialConsultant, true),
        ),
      );
    const [teacher] = await tx
      .update(schema.teachers)
      .set({ isTrialConsultant: true, updatedAt: new Date() })
      .where(eq(schema.teachers.id, teacherId))
      .returning();
    return teacher ?? null;
  });
}

export async function deleteTeacher(db: Database, teacherId: string) {
  const [teacher] = await db
    .delete(schema.teachers)
    .where(eq(schema.teachers.id, teacherId))
    .returning();
  return teacher ?? null;
}

export async function listInstitutions(db: Database) {
  return db
    .select()
    .from(schema.institutions)
    .orderBy(asc(schema.institutions.sortOrder), asc(schema.institutions.createdAt));
}

export async function findInstitution(db: Database, institutionId: string | null) {
  if (!institutionId) {
    return null;
  }
  const [institution] = await db
    .select()
    .from(schema.institutions)
    .where(eq(schema.institutions.id, institutionId))
    .limit(1);
  return institution ?? null;
}

export async function createInstitution(
  db: Database,
  values: typeof schema.institutions.$inferInsert,
) {
  const [institution] = await db.insert(schema.institutions).values(values).returning();
  return institution;
}

export async function updateInstitution(
  db: Database,
  institutionId: string,
  patch: Partial<typeof schema.institutions.$inferInsert>,
) {
  const [institution] = await db
    .update(schema.institutions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.institutions.id, institutionId))
    .returning();
  return institution ?? null;
}

export async function reorderInstitutions(db: Database, institutionIds: string[]) {
  const now = new Date();
  await Promise.all(
    institutionIds.map((institutionId, index) =>
      db
        .update(schema.institutions)
        .set({ sortOrder: index * 10, updatedAt: now })
        .where(eq(schema.institutions.id, institutionId)),
    ),
  );
  return listInstitutions(db);
}

export async function deleteInstitution(db: Database, institutionId: string) {
  const [institution] = await db
    .delete(schema.institutions)
    .where(eq(schema.institutions.id, institutionId))
    .returning();
  return institution ?? null;
}

export async function listClassrooms(db: Database) {
  return db.select().from(schema.classrooms).orderBy(desc(schema.classrooms.createdAt));
}

export async function findClassroom(db: Database, classroomId: string | null) {
  if (!classroomId) {
    return null;
  }
  const [classroom] = await db
    .select()
    .from(schema.classrooms)
    .where(eq(schema.classrooms.id, classroomId))
    .limit(1);
  return classroom ?? null;
}

export async function findClassrooms(db: Database, classroomIds: string[]) {
  const ids = Array.from(new Set(classroomIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const classrooms = await db
    .select()
    .from(schema.classrooms)
    .where(inArray(schema.classrooms.id, ids));
  const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
  return ids.flatMap((id) => {
    const classroom = classroomById.get(id);
    return classroom ? [classroom] : [];
  });
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
