import type { Database } from '../../db/client.js';
import * as notificationsRepo from '../../db/repositories/notifications.js';
import * as schema from '../../db/schema.js';

type RecipientType = (typeof schema.notificationRecipientEnum.enumValues)[number];
type Level = (typeof schema.notificationLevelEnum.enumValues)[number];

export interface CreateNotificationInput {
  recipientType: RecipientType;
  recipientId: string;
  category: string;
  level?: Level;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  sourceEventName?: string;
  dedupeKey: string;
  meta?: Record<string, unknown>;
}

/**
 * Thin service over the notifications repo. `create` is idempotent on
 * dedupeKey: a repeat insert with the same key returns the existing row instead
 * of creating a duplicate (used by payment callbacks etc.).
 */
export class NotificationsService {
  constructor(private readonly db: Database) {}

  async create(input: CreateNotificationInput) {
    const result = await notificationsRepo.createNotificationIfAbsent(this.db, {
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      category: input.category,
      level: input.level ?? 'info',
      title: input.title,
      body: input.body ?? '',
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
      sourceEventName: input.sourceEventName,
      dedupeKey: input.dedupeKey,
      meta: input.meta ?? {},
    });
    return result.notification;
  }

  listForRecipient(
    input: Parameters<typeof notificationsRepo.listForRecipient>[1],
  ) {
    return notificationsRepo.listForRecipient(this.db, input);
  }

  countUnread(recipientType: RecipientType, recipientId: string) {
    return notificationsRepo.countUnread(this.db, recipientType, recipientId);
  }

  markAsRead(notificationId: string, recipientId: string) {
    return notificationsRepo.markAsRead(this.db, notificationId, recipientId);
  }

  markAllAsRead(recipientType: RecipientType, recipientId: string) {
    return notificationsRepo.markAllAsRead(this.db, recipientType, recipientId);
  }
}
