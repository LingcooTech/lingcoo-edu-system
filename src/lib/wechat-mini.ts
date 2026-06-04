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
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', config.appId);
  url.searchParams.set('secret', config.appSecret);

  const payload = await fetchWechatJson<AccessTokenPayload>(url);
  assertWechatSuccess(payload, '获取微信 access_token 失败');
  if (!payload.access_token) {
    throw httpError(502, '微信 access_token 返回为空');
  }
  return payload.access_token;
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
