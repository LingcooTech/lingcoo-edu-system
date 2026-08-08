import { and, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;

export async function createAuditLog(
  db: DbOrTx,
  input: typeof schema.auditLogs.$inferInsert,
) {
  const [auditLog] = await db.insert(schema.auditLogs).values(input).returning();
  return auditLog!;
}

export async function listAuditLogs(
  db: Database,
  input: {
    institutionId?: string | null;
    action?: string;
    resourceType?: string;
    search?: string;
    from?: Date;
    to?: Date;
    limit: number;
  },
) {
  const filters = [];
  if (input.institutionId) filters.push(eq(schema.auditLogs.institutionId, input.institutionId));
  if (input.action) filters.push(eq(schema.auditLogs.action, input.action));
  if (input.resourceType) filters.push(eq(schema.auditLogs.resourceType, input.resourceType));
  if (input.from) filters.push(gte(schema.auditLogs.createdAt, input.from));
  if (input.to) filters.push(lte(schema.auditLogs.createdAt, input.to));
  if (input.search) {
    const pattern = `%${input.search}%`;
    filters.push(
      or(
        ilike(schema.auditLogs.action, pattern),
        ilike(schema.auditLogs.resourceType, pattern),
        ilike(schema.auditLogs.resourceId, pattern),
        ilike(schema.auditLogs.summary, pattern),
      )!,
    );
  }

  return db
    .select({
      auditLog: schema.auditLogs,
      actorDisplayName: schema.accounts.displayName,
      actorEmail: schema.accounts.email,
      institutionName: schema.institutions.name,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.accounts, eq(schema.auditLogs.actorAccountId, schema.accounts.id))
    .leftJoin(schema.institutions, eq(schema.auditLogs.institutionId, schema.institutions.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(input.limit);
}

export async function listAuditFacets(db: Database, institutionId?: string | null) {
  const rows = await db
    .select({ action: schema.auditLogs.action, resourceType: schema.auditLogs.resourceType })
    .from(schema.auditLogs)
    .where(institutionId ? eq(schema.auditLogs.institutionId, institutionId) : undefined);
  return {
    actions: Array.from(new Set(rows.map((row) => row.action))).sort(),
    resourceTypes: Array.from(new Set(rows.map((row) => row.resourceType))).sort(),
  };
}
