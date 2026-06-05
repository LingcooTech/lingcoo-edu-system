import { and, eq } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import * as accountsRepo from '../../db/repositories/accounts.js';
import * as notificationsRepo from '../../db/repositories/notifications.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as schema from '../../db/schema.js';
import type { AppEnv } from '../../lib/env.js';
import {
  getWechatMiniSubscribeTemplateId,
  sendWechatMiniSubscribeMessage,
  type WechatMiniSubscribeTemplateKey,
} from '../../lib/wechat-mini.js';

const DEFAULT_REMINDER_WINDOW_HOURS = 24;

type LessonNotificationTarget = Awaited<
  ReturnType<typeof schedulingRepo.listUpcomingLessonNotificationTargets>
>[number];

type AttendanceRecord = typeof schema.attendanceRecords.$inferSelect;
type ParentAccount = typeof schema.accounts.$inferSelect;

interface LessonNotificationLogger {
  info?: (payload: Record<string, unknown>, message: string) => void;
  warn?: (payload: Record<string, unknown>, message: string) => void;
  error?: (payload: Record<string, unknown>, message: string) => void;
}

export interface LessonNotificationRunResult {
  scannedTargets: number;
  parentAccounts: number;
  notificationsCreated: number;
  wechatSent: number;
  wechatSkipped: number;
}

function emptyRunResult(scannedTargets = 0): LessonNotificationRunResult {
  return {
    scannedTargets,
    parentAccounts: 0,
    notificationsCreated: 0,
    wechatSent: 0,
    wechatSkipped: 0,
  };
}

function mergeRunResult(total: LessonNotificationRunResult, item: LessonNotificationRunResult) {
  total.parentAccounts += item.parentAccounts;
  total.notificationsCreated += item.notificationsCreated;
  total.wechatSent += item.wechatSent;
  total.wechatSkipped += item.wechatSkipped;
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

function formatMessageTime(date: Date) {
  return `${getZonedPart(date, 'year')}-${getZonedPart(date, 'month')}-${getZonedPart(
    date,
    'day',
  )} ${getZonedPart(date, 'hour')}:${getZonedPart(date, 'minute')}`;
}

function formatDisplayTime(date: Date) {
  return `${getZonedPart(date, 'month')}/${getZonedPart(date, 'day')} ${getZonedPart(
    date,
    'hour',
  )}:${getZonedPart(date, 'minute')}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

export class LessonNotificationService {
  constructor(
    private readonly input: {
      db: Database;
      env: AppEnv;
      log?: LessonNotificationLogger;
    },
  ) {}

  async runUpcomingLessonReminders(input: { now?: Date; windowHours?: number } = {}) {
    const now = input.now ?? new Date();
    const windowHours =
      typeof input.windowHours === 'number' && input.windowHours > 0
        ? input.windowHours
        : DEFAULT_REMINDER_WINDOW_HOURS;
    const until = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
    const targets = await schedulingRepo.listUpcomingLessonNotificationTargets(this.input.db, {
      from: now,
      until,
    });
    const result = emptyRunResult(targets.length);

    for (const target of targets) {
      mergeRunResult(result, await this.notifyLessonReminderTarget(target));
    }

    return result;
  }

  async notifyLessonConsumedForAttendance(input: {
    sessionId: string;
    records: AttendanceRecord[];
  }) {
    const consumedRecords = input.records.filter((record) => record.lessonDelta < 0);
    const result = emptyRunResult(consumedRecords.length);
    if (consumedRecords.length === 0) {
      return result;
    }

    const targets = await schedulingRepo.listLessonNotificationTargetsForSessionStudents(
      this.input.db,
      input.sessionId,
      consumedRecords.map((record) => record.studentId),
    );
    const targetByStudentId = new Map(targets.map((target) => [target.studentId, target]));

    for (const record of consumedRecords) {
      const target = targetByStudentId.get(record.studentId);
      if (!target) {
        continue;
      }
      const balance = await this.findLessonBalance(target.studentId, target.courseId);
      mergeRunResult(result, await this.notifyLessonConsumedTarget(target, balance));
    }

    return result;
  }

  private async notifyLessonReminderTarget(target: LessonNotificationTarget) {
    const lessonName = `${target.courseName}（${target.className}）`;
    const startTime = formatDisplayTime(target.startsAt);
    const classroomText = target.classroomName ? `地点：${target.classroomName}。` : '';

    return this.notifyTargetParents({
      target,
      templateKey: 'lesson_reminder',
      sourceEventName: 'lesson.reminder',
      dedupePrefix: 'lesson.reminder',
      level: 'info',
      title: '课前提醒',
      body: `${target.studentName} 将在 ${startTime} 上课：${lessonName}。${classroomText}`,
      data: {
        thing1: { value: shortValue(target.studentName, '学员') },
        thing2: { value: shortValue(lessonName, '课程') },
        time3: { value: formatMessageTime(target.startsAt) },
        thing4: { value: shortValue(target.classroomName, '校区教室') },
      },
      meta: {
        sessionId: target.sessionId,
        studentId: target.studentId,
        courseId: target.courseId,
        classId: target.classId,
        startsAt: target.startsAt.toISOString(),
      },
    });
  }

  private async notifyLessonConsumedTarget(
    target: LessonNotificationTarget,
    balance: number | null,
  ) {
    const lessonName = `${target.courseName}（${target.className}）`;
    const balanceText = balance === null ? '已扣减 1 课时' : `扣减 1 课时，剩余 ${balance} 课时`;

    return this.notifyTargetParents({
      target,
      templateKey: 'lesson_consumed',
      sourceEventName: 'lesson.consumed',
      dedupePrefix: 'lesson.consumed',
      level: 'success',
      title: '课时已扣减',
      body: `${target.studentName} 已完成 ${formatDisplayTime(target.startsAt)} 的 ${lessonName}，${balanceText}。`,
      data: {
        thing1: { value: shortValue(target.studentName, '学员') },
        thing2: { value: shortValue(lessonName, '课程') },
        thing3: { value: shortValue(balanceText, '已扣减 1 课时') },
        time4: { value: formatMessageTime(target.startsAt) },
      },
      meta: {
        sessionId: target.sessionId,
        studentId: target.studentId,
        courseId: target.courseId,
        classId: target.classId,
        startsAt: target.startsAt.toISOString(),
        balance,
      },
    });
  }

  private async notifyTargetParents(input: {
    target: LessonNotificationTarget;
    templateKey: WechatMiniSubscribeTemplateKey;
    sourceEventName: string;
    dedupePrefix: string;
    level: 'info' | 'success';
    title: string;
    body: string;
    data: Record<string, { value: string }>;
    meta: Record<string, unknown>;
  }) {
    const accounts = await this.listParentAccountsForStudent(input.target.studentId);
    const result = emptyRunResult();
    result.parentAccounts = accounts.length;

    for (const account of accounts) {
      const dedupeKey = `${input.dedupePrefix}:${account.id}:${input.target.sessionId}:${input.target.studentId}`;
      const notificationResult = await notificationsRepo.createNotificationIfAbsent(this.input.db, {
        recipientType: 'parent',
        recipientId: account.id,
        category: 'lesson',
        level: input.level,
        title: input.title,
        body: input.body,
        ctaLabel: '查看家长中心',
        ctaUrl: '/account',
        sourceEventName: input.sourceEventName,
        dedupeKey,
        meta: input.meta,
      });

      if (!notificationResult.created) {
        continue;
      }

      result.notificationsCreated += 1;
      const wechatResult = await this.sendWechatSubscribe(
        account.id,
        input.templateKey,
        input.data,
        input.sourceEventName,
      );
      if (wechatResult === 'sent') {
        result.wechatSent += 1;
      } else {
        result.wechatSkipped += 1;
      }
    }

    return result;
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

  private async findLessonBalance(studentId: string, courseId: string) {
    const [row] = await this.input.db
      .select({ balance: schema.lessonAccounts.balance })
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, studentId),
          eq(schema.lessonAccounts.courseId, courseId),
        ),
      )
      .limit(1);
    return row?.balance ?? null;
  }

  private async sendWechatSubscribe(
    accountId: string,
    templateKey: WechatMiniSubscribeTemplateKey,
    data: Record<string, { value: string }>,
    sourceEventName: string,
  ) {
    const templateId = getWechatMiniSubscribeTemplateId(this.input.env, templateKey);
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
        page: '/pages/account/index',
        data,
      });
      if (!result.sent) {
        this.input.log?.info?.(
          {
            accountId,
            templateKey,
            sourceEventName,
            errcode: result.errcode,
            errmsg: result.errmsg,
          },
          'wechat mini lesson subscribe skipped',
        );
        return 'skipped' as const;
      }
      return 'sent' as const;
    } catch (error) {
      this.input.log?.warn?.(
        { err: serializeError(error), accountId, templateKey, sourceEventName },
        'wechat mini lesson subscribe failed',
      );
      return 'skipped' as const;
    }
  }
}
