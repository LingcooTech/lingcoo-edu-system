import { count, eq } from 'drizzle-orm';
import { z } from 'zod';

import { createDb } from './client.js';
import * as schema from './schema.js';
import { loadEnv } from '../lib/env.js';
import { hashPassword } from '../lib/password.js';

const bootstrapSchema = z.object({
  INITIAL_ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  INITIAL_ADMIN_PASSWORD: z.string().min(12).max(128),
  INITIAL_ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(120).default('系统管理员'),
  INITIAL_ORGANIZATION_NAME: z.string().trim().min(1).max(160),
  INITIAL_ORGANIZATION_BRAND_NAME: z.string().trim().min(1).max(160).optional(),
  INITIAL_ORGANIZATION_PHONE: z.string().trim().max(40).optional(),
  INITIAL_ORGANIZATION_ADDRESS: z.string().trim().max(255).optional(),
});

async function bootstrap() {
  const env = loadEnv();
  const input = bootstrapSchema.parse(process.env);
  const { db, pool } = createDb(env.DATABASE_URL);

  try {
    const result = await db.transaction(async (tx) => {
      const [[accountCount], organizations] = await Promise.all([
        tx.select({ value: count() }).from(schema.accounts),
        tx.select().from(schema.organization),
      ]);

      if (accountCount.value > 0) {
        if (organizations.length > 0) {
          return { initialized: false, reason: 'already_initialized' as const };
        }
        throw new Error('Refusing bootstrap because the database is only partially initialized');
      }

      const existingOrganization = organizations[0];
      const canClaimMigrationPlaceholder =
        organizations.length === 1 &&
        existingOrganization.name === '机构' &&
        existingOrganization.brandName === '机构';

      if (organizations.length > 0 && !canClaimMigrationPlaceholder) {
        throw new Error('Refusing bootstrap because the database is only partially initialized');
      }

      const [account] = await tx
        .insert(schema.accounts)
        .values({
          role: 'admin',
          email: input.INITIAL_ADMIN_EMAIL,
          displayName: input.INITIAL_ADMIN_DISPLAY_NAME,
          passwordHash: hashPassword(input.INITIAL_ADMIN_PASSWORD),
          mustChangePassword: true,
          emailVerifiedAt: new Date(),
        })
        .returning({ id: schema.accounts.id, email: schema.accounts.email });

      await tx.insert(schema.accountRoleAssignments).values({
        accountId: account.id,
        role: 'admin',
        status: 'active',
      });

      const organizationValues = {
        name: input.INITIAL_ORGANIZATION_NAME,
        brandName: input.INITIAL_ORGANIZATION_BRAND_NAME ?? input.INITIAL_ORGANIZATION_NAME,
        phone: input.INITIAL_ORGANIZATION_PHONE,
        address: input.INITIAL_ORGANIZATION_ADDRESS,
        settings: {},
      };
      const [organization] = existingOrganization
        ? await tx
            .update(schema.organization)
            .set({ ...organizationValues, updatedAt: new Date() })
            .where(eq(schema.organization.id, existingOrganization.id))
            .returning({ id: schema.organization.id, name: schema.organization.name })
        : await tx
            .insert(schema.organization)
            .values(organizationValues)
            .returning({ id: schema.organization.id, name: schema.organization.name });

      return {
        initialized: true,
        adminEmail: account.email,
        organizationId: organization.id,
        organizationName: organization.name,
      };
    });

    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
