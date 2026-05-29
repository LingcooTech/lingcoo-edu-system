import { and, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export async function requireTenant(db: Database, tenantId: string) {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  if (!tenant) {
    throw notFound('Tenant not found');
  }
  return tenant;
}

export async function findTenantBySlug(db: Database, slug: string) {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);
  return tenant ?? null;
}

export async function listTenantsForUser(db: Database, userId: string) {
  const memberships = await db
    .select({ tenantId: schema.tenantMemberships.tenantId })
    .from(schema.tenantMemberships)
    .where(eq(schema.tenantMemberships.userId, userId));
  const tenantIds = memberships.map((m) => m.tenantId);
  if (tenantIds.length === 0) {
    return [];
  }
  return db.select().from(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
}

export async function updateTenantSettings(
  db: Database,
  tenantId: string,
  settings: Record<string, unknown>,
) {
  const [tenant] = await db
    .update(schema.tenants)
    .set({ settings, updatedAt: new Date() })
    .where(eq(schema.tenants.id, tenantId))
    .returning();
  return tenant;
}

export async function listCampuses(db: Database, tenantId: string) {
  return db.select().from(schema.campuses).where(eq(schema.campuses.tenantId, tenantId));
}

export async function listChannels(db: Database, tenantId: string) {
  return db.select().from(schema.channels).where(eq(schema.channels.tenantId, tenantId));
}

export async function isMember(db: Database, tenantId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(schema.tenantMemberships)
    .where(
      and(
        eq(schema.tenantMemberships.tenantId, tenantId),
        eq(schema.tenantMemberships.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

export async function listMemberships(db: Database, tenantId: string) {
  return db
    .select()
    .from(schema.tenantMemberships)
    .where(eq(schema.tenantMemberships.tenantId, tenantId))
    .orderBy(desc(schema.tenantMemberships.createdAt));
}
