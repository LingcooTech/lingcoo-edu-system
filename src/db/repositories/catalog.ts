import { and, asc, desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export async function listCourses(db: Database) {
  return db.select().from(schema.courses).orderBy(desc(schema.courses.createdAt));
}

export type CourseSeries = typeof schema.courseSeries.$inferSelect;
export type NewCourseSeries = typeof schema.courseSeries.$inferInsert;

export async function listCourseSeries(db: Database) {
  return db
    .select()
    .from(schema.courseSeries)
    .orderBy(asc(schema.courseSeries.sortOrder), desc(schema.courseSeries.createdAt));
}

export async function createCourseSeries(db: Database, values: NewCourseSeries) {
  const [series] = await db.insert(schema.courseSeries).values(values).returning();
  return series;
}

export async function requireCourseSeries(db: Database, courseSeriesId: string) {
  const [series] = await db
    .select()
    .from(schema.courseSeries)
    .where(eq(schema.courseSeries.id, courseSeriesId))
    .limit(1);
  if (!series) {
    throw notFound('Course series not found');
  }
  return series;
}

export async function updateCourseSeries(
  db: Database,
  courseSeriesId: string,
  patch: Partial<NewCourseSeries>,
) {
  const [series] = await db
    .update(schema.courseSeries)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.courseSeries.id, courseSeriesId))
    .returning();
  return series ?? null;
}

export async function deleteCourseSeries(db: Database, courseSeriesId: string) {
  const [series] = await db
    .update(schema.courseSeries)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(schema.courseSeries.id, courseSeriesId))
    .returning();
  return series ?? null;
}

export async function listPublishedCourses(db: Database) {
  return db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.status, 'published'))
    .orderBy(desc(schema.courses.createdAt));
}

export type NewCourse = typeof schema.courses.$inferInsert;

export async function createCourse(db: Database, values: NewCourse) {
  const [course] = await db.insert(schema.courses).values(values).returning();
  return course;
}

export async function requireCourse(db: Database, courseId: string) {
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .limit(1);
  if (!course) {
    throw notFound('Course not found');
  }
  return course;
}

// Public course detail by slug. Only published courses are visible to parents.
export async function findPublishedCourseBySlug(db: Database, slug: string) {
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.slug, slug), eq(schema.courses.status, 'published')))
    .limit(1);
  return course ?? null;
}

export async function updateCourse(db: Database, courseId: string, patch: Partial<NewCourse>) {
  const [course] = await db
    .update(schema.courses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.courses.id, courseId))
    .returning();
  return course ?? null;
}

export async function deleteCourse(db: Database, courseId: string) {
  const [course] = await db
    .update(schema.courses)
    .set({ status: 'archived', onlineSalesEnabled: false, updatedAt: new Date() })
    .where(eq(schema.courses.id, courseId))
    .returning();
  return course ?? null;
}
