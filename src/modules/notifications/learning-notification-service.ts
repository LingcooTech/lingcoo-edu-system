import { and, eq } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import * as accountsRepo from '../../db/repositories/accounts.js';
import * as notificationsRepo from '../../db/repositories/notifications.js';
import * as schema from '../../db/schema.js';
import type { AppEnv } from '../../lib/env.js';
import {
  getWechatMiniSubscribeTemplateId,
  sendWechatMiniSubscribeMessage,
} from '../../lib/wechat-mini.js';

type ParentAccount = typeof schema.accounts.$inferSelect;

interface LearningNotificationLogger {
  info?: (payload: Record<string, unknown>, message: string) => void;
  warn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface LearningNotificationInput {
  studentId: string;
  studentName?: string | null;
  title: string;
  body: string;
  updateType: string;
  page?: string;
  level?: 'info' | 'success';
  sourceEventName: string;
  dedupeKey: string;
  meta?: Record<string, unknown>;
}

function shortValue(value: string | null | undefined, fallback: string, maxLength = 20) {
  const normalized = value?.trim() || fallback;
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

const shanghaiDateTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getZonedPart(date: Date, type: Intl.DateTimeFormatPartTypes) {
  return shanghaiDateTimeFormat.formatToParts(date).find((part) => part.type === type)?.value ?? '';
}

function formatMessageTime(date = new Date()) {
  return `${getZonedPart(date, 'year')}-${getZonedPart(date, 'month')}-${getZonedPart(
    date,
    'day',
  )} ${getZonedPart(date, 'hour')}:${getZonedPart(date, 'minute')}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

export class LearningNotificationService {
  constructor(
    private readonly input: {
      db: Database;
      env: AppEnv;
      log?: LearningNotificationLogger;
    },
  ) {}

  async notifyStudent(input: LearningNotificationInput) {
    const accounts = await this.listParentAccountsForStudent(input.studentId);
    let notificationsCreated = 0;
    let wechatSent = 0;
    let wechatSkipped = 0;

    for (const account of accounts) {
      const notificationResult = await notificationsRepo.createNotificationIfAbsent(this.input.db, {
        recipientType: 'parent',
        recipientId: account.id,
        category: 'learning',
        level: input.level ?? 'info',
        title: input.title,
        body: input.body,
        ctaLabel: '查看成长中心',
        ctaUrl: '/account',
        sourceEventName: input.sourceEventName,
        dedupeKey: `${input.dedupeKey}:${account.id}`.slice(0, 200),
        meta: input.meta ?? {},
      });

      if (!notificationResult.created) {
        continue;
      }

      notificationsCreated += 1;
      const wechatResult = await this.sendWechatSubscribe(account.id, input);
      if (wechatResult === 'sent') {
        wechatSent += 1;
      } else {
        wechatSkipped += 1;
      }
    }

    return {
      parentAccounts: accounts.length,
      notificationsCreated,
      wechatSent,
      wechatSkipped,
    };
  }

  private async listParentAccountsForStudent(studentId: string): Promise<ParentAccount[]> {
    const rows = await this.input.db
      .select({ account: schema.accounts })
      .from(schema.students)
      .innerJoin(schema.accounts, eq(schema.students.guardianId, schema.accounts.guardianId))
      .where(
        and(
          eq(schema.students.id, studentId),
          eq(schema.accounts.role, 'parent'),
          eq(schema.accounts.status, 'active'),
        ),
      );

    return rows.map((row) => row.account);
  }

  private async sendWechatSubscribe(accountId: string, input: LearningNotificationInput) {
    const templateId = getWechatMiniSubscribeTemplateId(this.input.env, 'learning_update');
    const appId = this.input.env.WECHAT_MINI_PROGRAM_APP_ID?.trim();
    if (!templateId || !appId) {
      return 'skipped' as const;
    }

    const identity = await accountsRepo.findWechatIdentityByAccount(
      this.input.db,
      accountId,
      appId,
    );
    if (!identity) {
      return 'skipped' as const;
    }

    try {
      const result = await sendWechatMiniSubscribeMessage(this.input.env, {
        toUser: identity.openid,
        templateId,
        page: input.page ?? '/pages/account/index',
        data: {
          thing1: { value: shortValue(input.updateType, '活动动态') },
          thing2: { value: shortValue(input.body || input.title, '有新的任务') },
          time3: { value: formatMessageTime() },
        },
      });
      if (!result.sent) {
        this.input.log?.info?.(
          {
            accountId,
            sourceEventName: input.sourceEventName,
            errcode: result.errcode,
            errmsg: result.errmsg,
          },
          'wechat mini learning subscribe skipped',
        );
        return 'skipped' as const;
      }
      return 'sent' as const;
    } catch (error) {
      this.input.log?.warn?.(
        { err: serializeError(error), accountId, sourceEventName: input.sourceEventName },
        'wechat mini learning subscribe failed',
      );
      return 'skipped' as const;
    }
  }
}
