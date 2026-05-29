import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

export type Notification = typeof schema.notifications.$inferSelect;
type RecipientType = (typeof schema.notificationRecipientEnum.enumValues)[number];
type Status = (typeof schema.notificationStatusEnum.enumValues)[number];

export async function findByDedupeKey(db: Database, dedupeKey: string) {
  const [row] = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.dedupeKey, dedupeKey))
    .limit(1);
  return row ?? null;
}

export async function createNotification(
  db: Database,
  values: typeof schema.notifications.$inferInsert,
) {
  const [row] = await db.insert(schema.notifications).values(values).returning();
  return row;
}

export async function listForRecipient(
  db: Database,
  input: {
    recipientType: RecipientType;
    recipientId: string;
    status?: Status;
    limit?: number;
  },
) {
  const conditions = [
    eq(schema.notifications.recipientType, input.recipientType),
    eq(schema.notifications.recipientId, input.recipientId),
  ];
  if (input.status) {
    conditions.push(eq(schema.notifications.status, input.status));
  }
  return db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(input.limit ?? 50);
}

export async function countUnread(
  db: Database,
  recipientType: RecipientType,
  recipientId: string,
) {
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientType, recipientType),
        eq(schema.notifications.recipientId, recipientId),
        eq(schema.notifications.status, 'unread'),
      ),
    );
  return rows.length;
}

export async function markAsRead(
  db: Database,
  notificationId: string,
  recipientId: string,
) {
  const [row] = await db
    .update(schema.notifications)
    .set({ status: 'read', updatedAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.recipientId, recipientId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markAllAsRead(
  db: Database,
  recipientType: RecipientType,
  recipientId: string,
) {
  const rows = await db
    .update(schema.notifications)
    .set({ status: 'read', updatedAt: new Date() })
    .where(
      and(
        eq(schema.notifications.recipientType, recipientType),
        eq(schema.notifications.recipientId, recipientId),
        eq(schema.notifications.status, 'unread'),
      ),
    )
    .returning();
  return rows.length;
}
