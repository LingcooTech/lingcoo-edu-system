import { eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type SettingRecord = typeof schema.settings.$inferSelect;

export async function getSetting(db: Database, key: string): Promise<SettingRecord | null> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return row ?? null;
}

export async function setSetting(
  db: Database,
  input: { key: string; value: unknown; isEncrypted: boolean; updatedBy?: string },
) {
  const [row] = await db
    .insert(schema.settings)
    .values({
      key: input.key,
      value: input.value as object,
      isEncrypted: input.isEncrypted,
      updatedBy: input.updatedBy ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: {
        value: input.value as object,
        isEncrypted: input.isEncrypted,
        updatedBy: input.updatedBy ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function deleteSetting(db: Database, key: string) {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}
