import { eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type Organization = typeof schema.organization.$inferSelect;
export type OrganizationInsert = typeof schema.organization.$inferInsert;

/**
 * Single-institution deployment: the organization is a singleton row. We read
 * the first (only) row; after seed it always exists.
 */
export async function getOrganization(db: Database): Promise<Organization | null> {
  const [row] = await db.select().from(schema.organization).limit(1);
  return row ?? null;
}

export async function requireOrganization(db: Database): Promise<Organization> {
  const org = await getOrganization(db);
  if (!org) {
    throw Object.assign(new Error('Organization not initialized'), { statusCode: 500 });
  }
  return org;
}

/**
 * Updates the singleton organization row, creating it if missing (first run).
 */
export async function updateOrganization(db: Database, patch: Partial<OrganizationInsert>) {
  const current = await getOrganization(db);
  if (!current) {
    const [created] = await db
      .insert(schema.organization)
      .values({
        name: patch.name ?? '',
        brandName: patch.brandName ?? patch.name ?? '',
        phone: patch.phone,
        address: patch.address,
        settings: patch.settings ?? {},
      })
      .returning();
    return created;
  }
  const [row] = await db
    .update(schema.organization)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.organization.id, current.id))
    .returning();
  return row;
}

export async function updateOrganizationSettings(
  db: Database,
  settings: Record<string, unknown>,
) {
  return updateOrganization(db, { settings });
}

export async function listCampuses(db: Database) {
  return db.select().from(schema.campuses);
}

export async function createCampus(db: Database, values: typeof schema.campuses.$inferInsert) {
  const [campus] = await db.insert(schema.campuses).values(values).returning();
  return campus;
}

export async function updateCampus(
  db: Database,
  campusId: string,
  patch: Partial<typeof schema.campuses.$inferInsert>,
) {
  const [campus] = await db
    .update(schema.campuses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.campuses.id, campusId))
    .returning();
  return campus ?? null;
}

export async function deleteCampus(db: Database, campusId: string) {
  const [campus] = await db
    .delete(schema.campuses)
    .where(eq(schema.campuses.id, campusId))
    .returning();
  return campus ?? null;
}
