import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export async function listCourses(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.tenantId, tenantId))
    .orderBy(desc(schema.courses.createdAt));
}

export async function listPublishedCourses(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.tenantId, tenantId), eq(schema.courses.status, 'published')))
    .orderBy(desc(schema.courses.createdAt));
}

export type NewCourse = typeof schema.courses.$inferInsert;

export async function createCourse(db: Database, values: NewCourse) {
  const [course] = await db.insert(schema.courses).values(values).returning();
  return course;
}

export async function requireCourse(db: Database, tenantId: string, courseId: string) {
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.tenantId, tenantId), eq(schema.courses.id, courseId)))
    .limit(1);
  if (!course) {
    throw notFound('Course not found');
  }
  return course;
}

// Public course detail by slug. Only published courses are visible to parents.
export async function findPublishedCourseBySlug(db: Database, tenantId: string, slug: string) {
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.tenantId, tenantId),
        eq(schema.courses.slug, slug),
        eq(schema.courses.status, 'published'),
      ),
    )
    .limit(1);
  return course ?? null;
}

export async function updateCourse(
  db: Database,
  tenantId: string,
  courseId: string,
  patch: Partial<NewCourse>,
) {
  const [course] = await db
    .update(schema.courses)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.courses.tenantId, tenantId), eq(schema.courses.id, courseId)))
    .returning();
  return course ?? null;
}

// Soft delete: courses are referenced by orders/leads/classes, so we archive
// rather than hard-delete to preserve referential integrity.
export async function archiveCourse(db: Database, tenantId: string, courseId: string) {
  return updateCourse(db, tenantId, courseId, { status: 'archived' });
}
