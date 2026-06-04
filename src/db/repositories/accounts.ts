import { and, desc, eq, isNull, or } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type Account = typeof schema.accounts.$inferSelect;
export type AccountRole = (typeof schema.accountRoleEnum.enumValues)[number];
type SecurityPurpose = (typeof schema.accountSecurityPurposeEnum.enumValues)[number];

export async function findById(db: Database, id: string) {
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .limit(1);
  return account ?? null;
}

export async function findByEmail(db: Database, email: string) {
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, email))
    .limit(1);
  return account ?? null;
}

export async function findByPhone(db: Database, phone: string) {
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.phone, phone))
    .limit(1);
  return account ?? null;
}

export async function findByTeacherId(db: Database, teacherId: string) {
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.teacherId, teacherId))
    .limit(1);
  return account ?? null;
}

/**
 * Looks up an account by its login identifier — matches against either email or
 * phone. The caller is responsible for normalizing the identifier (lowercasing
 * emails). One login endpoint accepts both, so a parent created with only a
 * phone number can still sign in.
 */
export async function findByIdentifier(db: Database, identifier: string) {
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(or(eq(schema.accounts.email, identifier), eq(schema.accounts.phone, identifier)))
    .limit(1);
  return account ?? null;
}

export async function createAccount(db: Database, values: typeof schema.accounts.$inferInsert) {
  const [account] = await db.insert(schema.accounts).values(values).returning();
  return account;
}

export async function updateAccount(
  db: Database,
  id: string,
  patch: Partial<typeof schema.accounts.$inferInsert>,
) {
  const [account] = await db
    .update(schema.accounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.accounts.id, id))
    .returning();
  return account ?? null;
}

export async function listByRole(db: Database, role: AccountRole) {
  return db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.role, role))
    .orderBy(desc(schema.accounts.createdAt));
}

export async function listAccounts(db: Database) {
  return db.select().from(schema.accounts).orderBy(desc(schema.accounts.createdAt));
}

export async function deleteAccount(db: Database, accountId: string) {
  const [account] = await db
    .delete(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .returning();
  return account ?? null;
}

// --- WeChat Mini Program identities ---

export async function findWechatIdentity(db: Database, appId: string, openid: string) {
  const [identity] = await db
    .select()
    .from(schema.accountWechatIdentities)
    .where(
      and(
        eq(schema.accountWechatIdentities.appId, appId),
        eq(schema.accountWechatIdentities.openid, openid),
      ),
    )
    .limit(1);
  return identity ?? null;
}

export async function findAccountByWechatIdentity(db: Database, appId: string, openid: string) {
  const [row] = await db
    .select({ account: schema.accounts })
    .from(schema.accountWechatIdentities)
    .innerJoin(
      schema.accounts,
      eq(schema.accountWechatIdentities.accountId, schema.accounts.id),
    )
    .where(
      and(
        eq(schema.accountWechatIdentities.appId, appId),
        eq(schema.accountWechatIdentities.openid, openid),
      ),
    )
    .limit(1);
  return row?.account ?? null;
}

export async function createWechatIdentity(
  db: Database,
  values: typeof schema.accountWechatIdentities.$inferInsert,
) {
  const [identity] = await db.insert(schema.accountWechatIdentities).values(values).returning();
  return identity;
}

export async function updateWechatIdentity(
  db: Database,
  id: string,
  patch: Partial<typeof schema.accountWechatIdentities.$inferInsert>,
) {
  const [identity] = await db
    .update(schema.accountWechatIdentities)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.accountWechatIdentities.id, id))
    .returning();
  return identity ?? null;
}

// --- Security codes (email verify / password reset) ---

export async function findLatestSecurityCode(
  db: Database,
  accountId: string,
  purpose: SecurityPurpose,
) {
  const [row] = await db
    .select()
    .from(schema.accountSecurityCodes)
    .where(
      and(
        eq(schema.accountSecurityCodes.accountId, accountId),
        eq(schema.accountSecurityCodes.purpose, purpose),
      ),
    )
    .orderBy(desc(schema.accountSecurityCodes.createdAt))
    .limit(1);
  return row ?? null;
}

export async function createSecurityCode(
  db: Database,
  values: typeof schema.accountSecurityCodes.$inferInsert,
) {
  const [row] = await db.insert(schema.accountSecurityCodes).values(values).returning();
  return row;
}

/**
 * Finds the most recent unconsumed, unexpired code for (account, purpose) whose
 * hash matches. Returns the row so the caller can mark it consumed.
 */
export async function findValidSecurityCode(
  db: Database,
  accountId: string,
  purpose: SecurityPurpose,
  codeHash: string,
) {
  const [row] = await db
    .select()
    .from(schema.accountSecurityCodes)
    .where(
      and(
        eq(schema.accountSecurityCodes.accountId, accountId),
        eq(schema.accountSecurityCodes.purpose, purpose),
        eq(schema.accountSecurityCodes.codeHash, codeHash),
        isNull(schema.accountSecurityCodes.consumedAt),
      ),
    )
    .orderBy(desc(schema.accountSecurityCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return row;
}

export async function consumeSecurityCode(db: Database, codeId: string) {
  await db
    .update(schema.accountSecurityCodes)
    .set({ consumedAt: new Date() })
    .where(eq(schema.accountSecurityCodes.id, codeId));
}
