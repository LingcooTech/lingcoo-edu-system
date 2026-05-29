import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type Parent = typeof schema.parents.$inferSelect;
type SecurityPurpose = (typeof schema.parentSecurityPurposeEnum.enumValues)[number];

export async function findParentByEmail(db: Database, tenantId: string, email: string) {
  const [parent] = await db
    .select()
    .from(schema.parents)
    .where(and(eq(schema.parents.tenantId, tenantId), eq(schema.parents.email, email)))
    .limit(1);
  return parent ?? null;
}

export async function findParentById(db: Database, parentId: string) {
  const [parent] = await db
    .select()
    .from(schema.parents)
    .where(eq(schema.parents.id, parentId))
    .limit(1);
  return parent ?? null;
}

export async function createParent(db: Database, values: typeof schema.parents.$inferInsert) {
  const [parent] = await db.insert(schema.parents).values(values).returning();
  return parent;
}

export async function updateParent(
  db: Database,
  parentId: string,
  patch: Partial<typeof schema.parents.$inferInsert>,
) {
  const [parent] = await db
    .update(schema.parents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.parents.id, parentId))
    .returning();
  return parent;
}

export async function findLatestSecurityCode(
  db: Database,
  parentId: string,
  purpose: SecurityPurpose,
) {
  const [row] = await db
    .select()
    .from(schema.parentSecurityCodes)
    .where(
      and(
        eq(schema.parentSecurityCodes.parentId, parentId),
        eq(schema.parentSecurityCodes.purpose, purpose),
      ),
    )
    .orderBy(desc(schema.parentSecurityCodes.createdAt))
    .limit(1);
  return row ?? null;
}

export async function createSecurityCode(
  db: Database,
  values: typeof schema.parentSecurityCodes.$inferInsert,
) {
  const [row] = await db.insert(schema.parentSecurityCodes).values(values).returning();
  return row;
}

/**
 * Finds the most recent unconsumed, unexpired code for (parent, purpose) whose
 * hash matches. Returns the row so the caller can mark it consumed.
 */
export async function findValidSecurityCode(
  db: Database,
  parentId: string,
  purpose: SecurityPurpose,
  codeHash: string,
) {
  const [row] = await db
    .select()
    .from(schema.parentSecurityCodes)
    .where(
      and(
        eq(schema.parentSecurityCodes.parentId, parentId),
        eq(schema.parentSecurityCodes.purpose, purpose),
        eq(schema.parentSecurityCodes.codeHash, codeHash),
        isNull(schema.parentSecurityCodes.consumedAt),
      ),
    )
    .orderBy(desc(schema.parentSecurityCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return row;
}

export async function consumeSecurityCode(db: Database, codeId: string) {
  await db
    .update(schema.parentSecurityCodes)
    .set({ consumedAt: new Date() })
    .where(eq(schema.parentSecurityCodes.id, codeId));
}
