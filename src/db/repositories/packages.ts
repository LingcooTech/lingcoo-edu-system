import { and, desc, eq, or } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export type CoursePackage = typeof schema.coursePackages.$inferSelect;
export type NewCoursePackage = typeof schema.coursePackages.$inferInsert;

export function effectivePackagePrice(pkg: CoursePackage) {
  return pkg.discountPriceAmount ?? pkg.priceAmount;
}

export function effectivePackageLessonCount(pkg: CoursePackage) {
  return pkg.lessonCount + pkg.giftedLessonCount;
}

export function isPeriodPackage(pkg: CoursePackage | null | undefined) {
  return pkg?.billingType === 'period';
}

export function periodPackageLabel(pkg: CoursePackage) {
  if (!isPeriodPackage(pkg) || !pkg.periodUnit) return '';
  const unit = pkg.periodUnit === 'week' ? '周' : '个月';
  return `${pkg.periodCount}${unit}`;
}

export function calculatePeriodEnd(startsAt: Date, pkg: CoursePackage) {
  if (!isPeriodPackage(pkg) || !pkg.periodUnit) return null;
  const next = new Date(startsAt);
  if (pkg.periodUnit === 'week') {
    next.setUTCDate(next.getUTCDate() + pkg.periodCount * 7);
  } else {
    const originalDay = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + pkg.periodCount);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(originalDay, lastDay));
  }
  return new Date(next.getTime() - 1);
}

export async function listPackages(db: Database) {
  return db.select().from(schema.coursePackages).orderBy(desc(schema.coursePackages.createdAt));
}

export async function listActivePackages(db: Database) {
  return db
    .select()
    .from(schema.coursePackages)
    .where(eq(schema.coursePackages.status, 'active'))
    .orderBy(desc(schema.coursePackages.createdAt));
}

export async function listActivePackagesForCourse(
  db: Database,
  courseId: string,
  courseSeriesId?: string | null,
) {
  const scope = courseSeriesId
    ? or(
        eq(schema.coursePackages.courseId, courseId),
        eq(schema.coursePackages.courseSeriesId, courseSeriesId),
      )
    : eq(schema.coursePackages.courseId, courseId);
  return db
    .select()
    .from(schema.coursePackages)
    .where(and(scope, eq(schema.coursePackages.status, 'active')))
    .orderBy(desc(schema.coursePackages.createdAt));
}

export async function createPackage(db: Database, values: NewCoursePackage) {
  const [pkg] = await db.insert(schema.coursePackages).values(values).returning();
  return pkg;
}

export async function updatePackage(
  db: Database,
  packageId: string,
  patch: Partial<NewCoursePackage>,
) {
  const [pkg] = await db
    .update(schema.coursePackages)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.coursePackages.id, packageId))
    .returning();
  return pkg ?? null;
}

export async function deletePackage(db: Database, packageId: string) {
  const [pkg] = await db
    .delete(schema.coursePackages)
    .where(eq(schema.coursePackages.id, packageId))
    .returning();
  return pkg ?? null;
}

export async function requirePackage(db: Database, packageId: string) {
  const [pkg] = await db
    .select()
    .from(schema.coursePackages)
    .where(eq(schema.coursePackages.id, packageId))
    .limit(1);
  if (!pkg) {
    throw notFound('Course package not found');
  }
  return pkg;
}
