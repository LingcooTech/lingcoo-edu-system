import type { FastifyInstance } from 'fastify';

import * as accountsRepo from '../db/repositories/accounts.js';
import {
  getWechatMiniSubscribeTemplateId,
  sendWechatMiniSubscribeMessage,
} from './wechat-mini.js';

function shortValue(value: string | null | undefined, fallback: string, maxLength = 20) {
  const normalized = value?.trim() || fallback;
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function formatMessageTime(date = new Date()) {
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

export async function sendTrialRegistrationSubscribe(input: {
  app: FastifyInstance;
  phone: string;
  studentName: string;
  courseName?: string | null;
  page?: string;
}) {
  const templateId = getWechatMiniSubscribeTemplateId(input.app.appEnv, 'trial_registration');
  const appId = input.app.appEnv.WECHAT_MINI_PROGRAM_APP_ID?.trim();
  if (!templateId || !appId) {
    return;
  }

  const account = await accountsRepo.findByPhone(input.app.db, input.phone);
  if (!account) {
    return;
  }
  const identity = await accountsRepo.findWechatIdentityByAccount(input.app.db, account.id, appId);
  if (!identity) {
    return;
  }

  try {
    const result = await sendWechatMiniSubscribeMessage(input.app.appEnv, {
      toUser: identity.openid,
      templateId,
      page: input.page ?? '/pages/account/index',
      data: {
        thing1: { value: shortValue(input.studentName, '学员') },
        thing2: { value: shortValue(input.courseName, '试听预约') },
        thing3: { value: '老师将电话确认' },
        time4: { value: formatMessageTime() },
      },
    });
    if (!result.sent) {
      input.app.log.info(
        { phone: input.phone, errcode: result.errcode, errmsg: result.errmsg },
        'wechat mini trial subscribe skipped',
      );
    }
  } catch (error) {
    input.app.log.warn({ err: error, phone: input.phone }, 'wechat mini trial subscribe failed');
  }
}
