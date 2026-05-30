import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export type CoursePackage = typeof schema.coursePackages.$inferSelect;
export type NewCoursePackage = typeof schema.coursePackages.$inferInsert;

export async function listPackages(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.coursePackages)
    .where(eq(schema.coursePackages.tenantId, tenantId))
    .orderBy(desc(schema.coursePackages.createdAt));
}

export async function listActivePackages(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.coursePackages)
    .where(
      and(
        eq(schema.coursePackages.tenantId, tenantId),
        eq(schema.coursePackages.status, 'active'),
      ),
    )
    .orderBy(desc(schema.coursePackages.createdAt));
}

export async function listActivePackagesForCourse(
  db: Database,
  tenantId: string,
  courseId: string,
) {
  return db
    .select()
    .from(schema.coursePackages)
    .where(
      and(
        eq(schema.coursePackages.tenantId, tenantId),
        eq(schema.coursePackages.courseId, courseId),
        eq(schema.coursePackages.status, 'active'),
      ),
    )
    .orderBy(desc(schema.coursePackages.createdAt));
}

export async function createPackage(db: Database, values: NewCoursePackage) {
  const [pkg] = await db.insert(schema.coursePackages).values(values).returning();
  return pkg;
}

export async function updatePackage(
  db: Database,
  tenantId: string,
  packageId: string,
  patch: Partial<NewCoursePackage>,
) {
  const [pkg] = await db
    .update(schema.coursePackages)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(schema.coursePackages.tenantId, tenantId),
        eq(schema.coursePackages.id, packageId),
      ),
    )
    .returning();
  return pkg ?? null;
}

export async function archivePackage(db: Database, tenantId: string, packageId: string) {
  return updatePackage(db, tenantId, packageId, { status: 'archived' });
}

export async function requirePackage(db: Database, tenantId: string, packageId: string) {
  const [pkg] = await db
    .select()
    .from(schema.coursePackages)
    .where(
      and(
        eq(schema.coursePackages.tenantId, tenantId),
        eq(schema.coursePackages.id, packageId),
      ),
    )
    .limit(1);
  if (!pkg) {
    throw notFound('Course package not found');
  }
  return pkg;
}
