import { and, desc, eq, isNull, or } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type Account = typeof schema.accounts.$inferSelect;
export type AccountRole = (typeof schema.accountRoleEnum.enumValues)[number];
export type AccountRoleAssignment = typeof schema.accountRoleAssignments.$inferSelect;
export type AccountStatus = (typeof schema.accountStatusEnum.enumValues)[number];
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
  const [assignmentRow] = await db
    .select({ account: schema.accounts })
    .from(schema.accountRoleAssignments)
    .innerJoin(schema.accounts, eq(schema.accountRoleAssignments.accountId, schema.accounts.id))
    .where(
      and(
        eq(schema.accountRoleAssignments.role, 'teacher'),
        eq(schema.accountRoleAssignments.teacherId, teacherId),
      ),
    )
    .limit(1);
  if (assignmentRow?.account) {
    return assignmentRow.account;
  }

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
  await upsertRoleAssignment(db, {
    accountId: account.id,
    role: account.role,
    guardianId: account.role === 'parent' ? (account.guardianId ?? null) : null,
    teacherId: account.role === 'teacher' ? (account.teacherId ?? null) : null,
    status: account.status,
  });
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
  if (account) {
    await upsertRoleAssignment(db, {
      accountId: account.id,
      role: account.role,
      guardianId: account.role === 'parent' ? (account.guardianId ?? null) : null,
      teacherId: account.role === 'teacher' ? (account.teacherId ?? null) : null,
      status: account.status,
    });
  }
  return account ?? null;
}

export async function listByRole(db: Database, role: AccountRole) {
  const rows = await db
    .select({ account: schema.accounts })
    .from(schema.accountRoleAssignments)
    .innerJoin(schema.accounts, eq(schema.accountRoleAssignments.accountId, schema.accounts.id))
    .where(eq(schema.accountRoleAssignments.role, role))
    .orderBy(desc(schema.accounts.createdAt));
  return rows.map((row) => row.account);
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

// --- Account role assignments ---

export async function listRoleAssignments(db: Database) {
  return db.select().from(schema.accountRoleAssignments);
}

export async function listRoleAssignmentsForAccount(db: Database, accountId: string) {
  return db
    .select()
    .from(schema.accountRoleAssignments)
    .where(eq(schema.accountRoleAssignments.accountId, accountId));
}

export async function findRoleAssignment(
  db: Database,
  input: { accountId: string; role: AccountRole },
) {
  const [assignment] = await db
    .select()
    .from(schema.accountRoleAssignments)
    .where(
      and(
        eq(schema.accountRoleAssignments.accountId, input.accountId),
        eq(schema.accountRoleAssignments.role, input.role),
      ),
    )
    .limit(1);
  return assignment ?? null;
}

export async function upsertRoleAssignment(
  db: Database,
  values: typeof schema.accountRoleAssignments.$inferInsert,
) {
  const [assignment] = await db
    .insert(schema.accountRoleAssignments)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.accountRoleAssignments.accountId, schema.accountRoleAssignments.role],
      set: {
        guardianId: values.guardianId ?? null,
        teacherId: values.teacherId ?? null,
        ...(values.teacherPermissions !== undefined
          ? { teacherPermissions: values.teacherPermissions }
          : {}),
        status: values.status ?? 'active',
        updatedAt: new Date(),
      },
    })
    .returning();
  return assignment;
}

export async function replaceRoleAssignmentsForAccount(
  db: Database,
  accountId: string,
  assignments: Array<{
    role: AccountRole;
    guardianId?: string | null;
    teacherId?: string | null;
    teacherPermissions?: schema.TeacherPermissions;
    status?: AccountStatus;
  }>,
) {
  await db
    .delete(schema.accountRoleAssignments)
    .where(eq(schema.accountRoleAssignments.accountId, accountId));

  if (!assignments.length) {
    return [];
  }

  return db
    .insert(schema.accountRoleAssignments)
    .values(
      assignments.map((assignment) => ({
        accountId,
        role: assignment.role,
        guardianId: assignment.role === 'parent' ? (assignment.guardianId ?? null) : null,
        teacherId: assignment.role === 'teacher' ? (assignment.teacherId ?? null) : null,
        teacherPermissions:
          assignment.role === 'teacher' ? (assignment.teacherPermissions ?? {}) : {},
        status: assignment.status ?? 'active',
      })),
    )
    .returning();
}

export async function accountHasActiveRole(db: Database, accountId: string, role: string) {
  if (!schema.accountRoleEnum.enumValues.includes(role as AccountRole)) {
    return false;
  }
  const account = await findById(db, accountId);
  if (!account || account.status !== 'active') {
    return false;
  }

  const assignment = await findRoleAssignment(db, {
    accountId,
    role: role as AccountRole,
  });
  if (assignment) {
    return assignment.status === 'active';
  }

  return account.role === role;
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
    .innerJoin(schema.accounts, eq(schema.accountWechatIdentities.accountId, schema.accounts.id))
    .where(
      and(
        eq(schema.accountWechatIdentities.appId, appId),
        eq(schema.accountWechatIdentities.openid, openid),
      ),
    )
    .limit(1);
  return row?.account ?? null;
}

export async function findWechatIdentityByAccount(db: Database, accountId: string, appId: string) {
  const [identity] = await db
    .select()
    .from(schema.accountWechatIdentities)
    .where(
      and(
        eq(schema.accountWechatIdentities.accountId, accountId),
        eq(schema.accountWechatIdentities.appId, appId),
      ),
    )
    .limit(1);
  return identity ?? null;
}

export async function listWechatIdentities(db: Database) {
  return db.select().from(schema.accountWechatIdentities);
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

export async function deleteWechatIdentity(db: Database, identityId: string) {
  const [identity] = await db
    .delete(schema.accountWechatIdentities)
    .where(eq(schema.accountWechatIdentities.id, identityId))
    .returning();
  return identity ?? null;
}

export async function deleteWechatIdentityForAccount(
  db: Database,
  input: { identityId: string; accountId: string },
) {
  const [identity] = await db
    .delete(schema.accountWechatIdentities)
    .where(
      and(
        eq(schema.accountWechatIdentities.id, input.identityId),
        eq(schema.accountWechatIdentities.accountId, input.accountId),
      ),
    )
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
