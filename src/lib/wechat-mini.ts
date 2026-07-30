import type { AppEnv } from './env.js';
import { httpError } from './http-error.js';

interface WechatErrorPayload {
  errcode?: number;
  errmsg?: string;
}

interface Jscode2SessionPayload extends WechatErrorPayload {
  openid?: string;
  session_key?: string;
  unionid?: string;
}

interface AccessTokenPayload extends WechatErrorPayload {
  access_token?: string;
  expires_in?: number;
}

interface PhoneNumberPayload extends WechatErrorPayload {
  phone_info?: {
    phoneNumber?: string;
    purePhoneNumber?: string;
    countryCode?: string;
  };
}

interface SubscribeMessagePayload extends WechatErrorPayload {
  msgid?: number;
}

export type WechatMiniSubscribeTemplateKey =
  | 'trial_registration'
  | 'payment_success'
  | 'lesson_reminder'
  | 'lesson_consumed'
  | 'learning_update';

export interface WechatMiniSubscribeTemplate {
  key: WechatMiniSubscribeTemplateKey;
  label: string;
  templateId: string;
}

export interface WechatMiniSubscribeMessageInput {
  toUser: string;
  templateId: string;
  page?: string;
  data: Record<string, { value: string }>;
}

export interface WechatMiniSubscribeMessageResult {
  sent: boolean;
  msgid?: number;
  errcode?: number;
  errmsg?: string;
}

export interface WechatMiniCodeInput {
  page: string;
  scene: string;
  width?: number;
}

const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

function requireWechatMiniConfig(env: AppEnv) {
  if (!env.WECHAT_MINI_PROGRAM_APP_ID || !env.WECHAT_MINI_PROGRAM_APP_SECRET) {
    throw httpError(501, '微信小程序 AppID/AppSecret 未配置');
  }
  return {
    appId: env.WECHAT_MINI_PROGRAM_APP_ID,
    appSecret: env.WECHAT_MINI_PROGRAM_APP_SECRET,
  };
}

function assertWechatSuccess(payload: WechatErrorPayload, fallbackMessage: string) {
  if (payload.errcode && payload.errcode !== 0) {
    throw httpError(502, payload.errmsg || fallbackMessage);
  }
}

function miniprogramState(env: AppEnv) {
  return env.WECHAT_MINI_PROGRAM_STATE ?? (env.NODE_ENV === 'production' ? 'formal' : 'developer');
}

function miniCodeEnvVersion(env: AppEnv) {
  const state = miniprogramState(env);
  if (state === 'formal') return 'release';
  if (state === 'developer') return 'develop';
  return 'trial';
}

export function getWechatMiniSubscribeTemplates(env: AppEnv): WechatMiniSubscribeTemplate[] {
  const templates: WechatMiniSubscribeTemplate[] = [
    {
      key: 'trial_registration',
      label: '预约通知',
      templateId: env.WECHAT_MINI_SUBSCRIBE_TRIAL_TEMPLATE_ID?.trim() ?? '',
    },
    {
      key: 'payment_success',
      label: '支付成功通知',
      templateId: env.WECHAT_MINI_SUBSCRIBE_PAYMENT_TEMPLATE_ID?.trim() ?? '',
    },
    {
      key: 'lesson_reminder',
      label: '日程提醒',
      templateId: env.WECHAT_MINI_SUBSCRIBE_LESSON_REMINDER_TEMPLATE_ID?.trim() ?? '',
    },
    {
      key: 'lesson_consumed',
      label: '核销成功通知',
      templateId: env.WECHAT_MINI_SUBSCRIBE_LESSON_CONSUMED_TEMPLATE_ID?.trim() ?? '',
    },
    {
      key: 'learning_update',
      label: '线上活动任务发布通知',
      templateId: env.WECHAT_MINI_SUBSCRIBE_LEARNING_UPDATE_TEMPLATE_ID?.trim() ?? '',
    },
  ];
  return templates.filter((item) => Boolean(item.templateId));
}

export function getWechatMiniSubscribeTemplateId(env: AppEnv, key: WechatMiniSubscribeTemplateKey) {
  return getWechatMiniSubscribeTemplates(env).find((item) => item.key === key)?.templateId ?? '';
}

async function fetchWechatJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw httpError(502, `微信接口请求失败：${response.status}`);
  }
  return (await response.json()) as T;
}

export async function exchangeWechatMiniCode(env: AppEnv, code: string) {
  const config = requireWechatMiniConfig(env);
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.appId);
  url.searchParams.set('secret', config.appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const payload = await fetchWechatJson<Jscode2SessionPayload>(url);
  assertWechatSuccess(payload, '微信登录失败');
  if (!payload.openid || !payload.session_key) {
    throw httpError(502, '微信登录返回缺少 openid');
  }

  return {
    appId: config.appId,
    openid: payload.openid,
    unionid: payload.unionid ?? null,
  };
}

async function getWechatAccessToken(env: AppEnv) {
  const config = requireWechatMiniConfig(env);
  const cached = accessTokenCache.get(config.appId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', config.appId);
  url.searchParams.set('secret', config.appSecret);

  const payload = await fetchWechatJson<AccessTokenPayload>(url);
  assertWechatSuccess(payload, '获取微信 access_token 失败');
  if (!payload.access_token) {
    throw httpError(502, '微信 access_token 返回为空');
  }
  accessTokenCache.set(config.appId, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max((payload.expires_in ?? 7200) - 300, 60) * 1000,
  });
  return payload.access_token;
}

export async function createWechatMiniCode(env: AppEnv, input: WechatMiniCodeInput) {
  const accessToken = await getWechatAccessToken(env);
  const url = new URL('https://api.weixin.qq.com/wxa/getwxacodeunlimit');
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: input.page.replace(/^\/+/, ''),
      scene: input.scene,
      width: input.width ?? 430,
      check_path: false,
      env_version: miniCodeEnvVersion(env),
    }),
  });
  if (!response.ok) {
    throw httpError(502, `生成小程序码失败：${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    const payload = (await response.json()) as WechatErrorPayload;
    assertWechatSuccess(payload, '生成小程序码失败');
    throw httpError(502, payload.errmsg || '微信未返回小程序码');
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function getWechatMiniPhoneNumber(env: AppEnv, phoneCode: string) {
  const accessToken = await getWechatAccessToken(env);
  const url = new URL('https://api.weixin.qq.com/wxa/business/getuserphonenumber');
  url.searchParams.set('access_token', accessToken);

  const payload = await fetchWechatJson<PhoneNumberPayload>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: phoneCode }),
  });
  assertWechatSuccess(payload, '获取微信手机号失败');

  const phone = payload.phone_info?.purePhoneNumber || payload.phone_info?.phoneNumber;
  if (!phone) {
    throw httpError(502, '微信手机号返回为空');
  }
  return phone;
}

export async function sendWechatMiniSubscribeMessage(
  env: AppEnv,
  input: WechatMiniSubscribeMessageInput,
): Promise<WechatMiniSubscribeMessageResult> {
  if (!input.templateId.trim() || !input.toUser.trim()) {
    return { sent: false, errmsg: 'missing templateId or touser' };
  }

  const accessToken = await getWechatAccessToken(env);
  const url = new URL('https://api.weixin.qq.com/cgi-bin/message/subscribe/send');
  url.searchParams.set('access_token', accessToken);

  const payload = await fetchWechatJson<SubscribeMessagePayload>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: input.toUser,
      template_id: input.templateId,
      page: input.page,
      miniprogram_state: miniprogramState(env),
      lang: 'zh_CN',
      data: input.data,
    }),
  });

  if (!payload.errcode || payload.errcode === 0) {
    return { sent: true, msgid: payload.msgid };
  }

  // 43101 = user refused or did not grant the one-time subscription. This is an
  // expected runtime outcome and should not break the business transaction.
  if (payload.errcode === 43101) {
    return { sent: false, errcode: payload.errcode, errmsg: payload.errmsg };
  }

  throw httpError(502, payload.errmsg || '发送微信订阅消息失败');
}
