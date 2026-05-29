import { createHash, createHmac, randomBytes } from 'node:crypto';

import { httpError } from '../../../lib/http-error.js';
import { normalizeObject, resolveCallbackUrl, resolvePublicBaseUrl, secretConfigured } from './shared.js';
import type {
  PaymentNotificationResult,
  PaymentProviderAdapter,
  PaymentQueryResult,
  ProviderContext,
  ProviderNotificationContext,
  ProviderQueryContext
} from './types.js';

type WechatXmlPayload = Record<string, string>;

const WECHAT_NATIVE_API_PATH = '/pay/unifiedorder';
const WECHAT_ORDER_QUERY_API_PATH = '/pay/orderquery';
const WECHAT_NOTIFY_PATH = '/public/payment/wechat/notify';

export class WechatPayProvider implements PaymentProviderAdapter {
  code = 'wechat_pay' as const;
  label = '微信支付';

  isConfigured(env?: ProviderContext['env']) {
    if (!env) {
      return false;
    }

    return Boolean(
      env.WECHAT_PAY_MCH_ID?.trim() &&
        env.WECHAT_PAY_APP_ID?.trim() &&
        env.WECHAT_PAY_APP_SECRET?.trim() &&
        (env.WECHAT_PAY_KEY?.trim() || env.WECHAT_PAY_API_V3_KEY?.trim())
    );
  }

  getOverview(env: ProviderContext['env']) {
    return {
      notifyUrl: this.getNotifyUrl(env),
      values: {
        appId: env.WECHAT_PAY_APP_ID?.trim() ?? '',
        mchId: env.WECHAT_PAY_MCH_ID?.trim() ?? '',
        apiBaseUrl: this.getApiBaseUrl(env)
      },
      secrets: {
        appSecret: { configured: secretConfigured(env.WECHAT_PAY_APP_SECRET) },
        apiKey: { configured: secretConfigured(env.WECHAT_PAY_KEY) || secretConfigured(env.WECHAT_PAY_API_V3_KEY) }
      }
    };
  }

  private getApiBaseUrl(env: ProviderContext['env']) {
    return env.WECHAT_PAY_API_BASE_URL?.trim() || 'https://api.mch.weixin.qq.com';
  }

  private getApiKey(env: ProviderContext['env']) {
    const value = env.WECHAT_PAY_KEY?.trim() || env.WECHAT_PAY_API_V3_KEY?.trim();
    if (!value) {
      throw httpError(422, 'WECHAT_PAY_KEY is not configured');
    }

    return value;
  }

  private getNotifyUrl(env: ProviderContext['env']) {
    return resolveCallbackUrl(
      env.WECHAT_PAY_NOTIFY_URL,
      resolvePublicBaseUrl({ publicBaseUrl: env.PUBLIC_BASE_URL, appBaseUrl: env.APP_BASE_URL }),
      WECHAT_NOTIFY_PATH
    );
  }

  private buildXml(values: Record<string, string | number>) {
    const body = Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        if (typeof value === 'number') {
          return `<${key}>${value}</${key}>`;
        }

        const escaped = value.replace(/]]>/g, ']]]]><![CDATA[>');
        return `<${key}><![CDATA[${escaped}]]></${key}>`;
      })
      .join('');

    return `<xml>${body}</xml>`;
  }

  private parseXml(xml: string) {
    const trimmed = xml.trim();

    if (!trimmed) {
      throw httpError(400, 'Empty WeChat Pay XML payload');
    }

    const inner = trimmed.replace(/^\s*<xml>/i, '').replace(/<\/xml>\s*$/i, '');
    const result: WechatXmlPayload = {};
    const pattern = /<([a-zA-Z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;

    for (const match of inner.matchAll(pattern)) {
      const [, key, cdataValue, plainValue] = match;
      if (key) {
        result[key] = (cdataValue ?? plainValue ?? '').trim();
      }
    }

    if (Object.keys(result).length === 0) {
      throw httpError(400, 'Failed to parse WeChat Pay XML payload');
    }

    return result;
  }

  private buildSignContent(values: Record<string, string | number>) {
    return Object.entries(values)
      .filter(([key, value]) => key !== 'sign' && value !== undefined && value !== null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  private createSignature(values: Record<string, string | number>, key: string, signType: 'MD5' | 'HMAC-SHA256') {
    const signContent = `${this.buildSignContent(values)}&key=${key}`;

    if (signType === 'MD5') {
      return createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();
    }

    return createHmac('sha256', key).update(signContent, 'utf8').digest('hex').toUpperCase();
  }

  private verifySignature(values: WechatXmlPayload, key: string) {
    const sign = values.sign?.trim().toUpperCase();
    if (!sign) {
      throw httpError(400, 'Missing WeChat Pay signature');
    }

    const signType =
      values.sign_type?.trim().toUpperCase() === 'MD5'
        ? 'MD5'
        : values.sign_type?.trim().toUpperCase() === 'HMAC-SHA256'
          ? 'HMAC-SHA256'
          : sign.length > 32
            ? 'HMAC-SHA256'
            : 'MD5';
    const expected = this.createSignature(values, key, signType);

    if (expected !== sign) {
      throw httpError(400, 'Invalid WeChat Pay callback signature');
    }
  }

  private truncateBody(value: string) {
    const normalized = value.trim() || 'FD-edu order';
    return normalized.length <= 120 ? normalized : normalized.slice(0, 120);
  }

  private extractIpv4(value: string | undefined) {
    if (!value) {
      return '';
    }

    const normalized = value.trim();

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
      return normalized;
    }

    const mapped = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    return mapped?.[1] ?? '';
  }

  private resolveClientIp(context: ProviderContext) {
    const requestIp = this.extractIpv4(context.clientIp);
    if (requestIp) {
      return requestIp;
    }

    try {
      const publicHost = new URL(
        resolvePublicBaseUrl({ publicBaseUrl: context.env.PUBLIC_BASE_URL, appBaseUrl: context.env.APP_BASE_URL })
      ).hostname;
      const hostIp = this.extractIpv4(publicHost);
      if (hostIp) {
        return hostIp;
      }
    } catch {
      // ignore invalid public base URL; env validation catches normal cases
    }

    return '127.0.0.1';
  }

  private parsePaidAt(value: string | undefined) {
    if (!value || !/^\d{14}$/.test(value)) {
      return new Date();
    }

    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    const hour = value.slice(8, 10);
    const minute = value.slice(10, 12);
    const second = value.slice(12, 14);

    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
  }

  async preparePayment(context: ProviderContext) {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    if (context.order.currency !== 'CNY') {
      throw httpError(422, 'WeChat Pay only supports CNY');
    }

    const notifyUrl = this.getNotifyUrl(context.env);
    const requestPayload: Record<string, string | number> = {
      appid: context.env.WECHAT_PAY_APP_ID!.trim(),
      mch_id: context.env.WECHAT_PAY_MCH_ID!.trim(),
      nonce_str: randomBytes(16).toString('hex'),
      sign_type: 'HMAC-SHA256',
      body: this.truncateBody(context.order.subject),
      out_trade_no: context.order.orderNo,
      total_fee: context.order.amount,
      fee_type: context.order.currency,
      spbill_create_ip: this.resolveClientIp(context),
      notify_url: notifyUrl,
      trade_type: 'NATIVE',
      product_id: context.order.orderNo
    };

    requestPayload.sign = this.createSignature(requestPayload, this.getApiKey(context.env), 'HMAC-SHA256');

    const response = await fetch(new URL(WECHAT_NATIVE_API_PATH, this.getApiBaseUrl(context.env)), {
      method: 'POST',
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'Content-Type': 'text/xml; charset=utf-8'
      },
      body: this.buildXml(requestPayload),
      signal: AbortSignal.timeout(10_000)
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw httpError(502, `WeChat Pay create order failed: ${response.status} ${responseText || 'empty response'}`);
    }

    const responsePayload = this.parseXml(responseText);

    if (responsePayload.return_code === 'SUCCESS' && responsePayload.sign) {
      this.verifySignature(responsePayload, this.getApiKey(context.env));
    }

    if (responsePayload.return_code !== 'SUCCESS') {
      throw httpError(502, `WeChat Pay create order failed: ${responsePayload.return_msg ?? 'unknown return error'}`);
    }

    if (responsePayload.result_code !== 'SUCCESS' || !responsePayload.code_url) {
      throw httpError(
        502,
        `WeChat Pay create order failed: ${responsePayload.err_code_des ?? responsePayload.return_msg ?? 'empty response'}`
      );
    }

    return {
      orderNo: context.order.orderNo,
      provider: this.code,
      amount: context.order.amount,
      currency: context.order.currency,
      mode: 'native_qr',
      status: 'pending_payment',
      configured: true,
      integrationStatus: 'live',
      notifyUrl,
      nextAction: 'render_qr',
      nextStep: 'Render payload.qrCodeText as a QR code. The order is marked paid after the WeChat Pay callback.',
      payload: {
        codeUrl: responsePayload.code_url,
        qrCodeText: responsePayload.code_url,
        prepayId: responsePayload.prepay_id ?? ''
      }
    } as const;
  }

  async parseNotification(context: ProviderNotificationContext): Promise<PaymentNotificationResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    const rawBody = typeof context.rawBody === 'string' ? context.rawBody : context.rawBody?.toString('utf8') ?? '';
    if (!rawBody) {
      throw httpError(400, 'Missing WeChat Pay callback body');
    }

    const payload = this.parseXml(rawBody);

    if (payload.return_code !== 'SUCCESS') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId: payload.out_trade_no || `wechat_${Date.now()}`,
        payload,
        reason: `Unhandled WeChat return_code: ${payload.return_code ?? 'unknown'}`
      };
    }

    this.verifySignature(payload, this.getApiKey(context.env));

    if (payload.appid && payload.appid !== context.env.WECHAT_PAY_APP_ID) {
      throw httpError(400, 'WeChat Pay app id mismatch');
    }

    if (payload.mch_id && payload.mch_id !== context.env.WECHAT_PAY_MCH_ID) {
      throw httpError(400, 'WeChat Pay merchant id mismatch');
    }

    if (payload.result_code !== 'SUCCESS') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId: payload.transaction_id || payload.out_trade_no || `wechat_${Date.now()}`,
        payload,
        reason: `Unhandled WeChat result_code: ${payload.result_code ?? 'unknown'}`
      };
    }

    if (!payload.out_trade_no || !payload.transaction_id || !payload.total_fee) {
      throw httpError(400, 'Missing WeChat Pay payment fields');
    }

    const amount = Number.parseInt(payload.total_fee, 10);
    if (!Number.isFinite(amount)) {
      throw httpError(400, 'Invalid WeChat Pay total_fee');
    }

    return {
      kind: 'paid',
      provider: this.code,
      providerEventId: payload.transaction_id,
      orderNo: payload.out_trade_no,
      providerOrderId: payload.transaction_id,
      amount,
      currency: 'CNY',
      paidAt: this.parsePaidAt(payload.time_end),
      payload: normalizeObject(payload)
    };
  }

  async queryPayment(context: ProviderQueryContext): Promise<PaymentQueryResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    const requestPayload: Record<string, string> = {
      appid: context.env.WECHAT_PAY_APP_ID!.trim(),
      mch_id: context.env.WECHAT_PAY_MCH_ID!.trim(),
      nonce_str: randomBytes(16).toString('hex'),
      sign_type: 'HMAC-SHA256',
      out_trade_no: context.order.orderNo
    };

    if (context.order.providerOrderId?.trim()) {
      requestPayload.transaction_id = context.order.providerOrderId.trim();
    }

    requestPayload.sign = this.createSignature(requestPayload, this.getApiKey(context.env), 'HMAC-SHA256');

    const response = await fetch(new URL(WECHAT_ORDER_QUERY_API_PATH, this.getApiBaseUrl(context.env)), {
      method: 'POST',
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'Content-Type': 'text/xml; charset=utf-8'
      },
      body: this.buildXml(requestPayload),
      signal: AbortSignal.timeout(10_000)
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw httpError(502, `WeChat Pay query order failed: ${response.status} ${responseText || 'empty response'}`);
    }

    const payload = this.parseXml(responseText);

    if (payload.return_code === 'SUCCESS' && payload.sign) {
      this.verifySignature(payload, this.getApiKey(context.env));
    }

    if (payload.return_code !== 'SUCCESS') {
      throw httpError(502, `WeChat Pay query order failed: ${payload.return_msg ?? 'unknown return error'}`);
    }

    if (payload.result_code !== 'SUCCESS') {
      if (payload.err_code?.trim().toUpperCase() === 'ORDERNOTEXIST') {
        return {
          kind: 'not_found',
          provider: this.code,
          orderNo: context.order.orderNo,
          payload: normalizeObject(payload),
          reason: payload.err_code_des ?? 'Order not found in WeChat Pay'
        };
      }

      throw httpError(502, `WeChat Pay query order failed: ${payload.err_code_des ?? 'empty response'}`);
    }

    const tradeState = payload.trade_state?.trim().toUpperCase() || 'UNKNOWN';
    const normalizedPayload = normalizeObject(payload);

    if (tradeState === 'SUCCESS') {
      if (!payload.transaction_id || !payload.total_fee) {
        throw httpError(400, 'Missing WeChat Pay query payment fields');
      }

      const amount = Number.parseInt(payload.total_fee, 10);
      if (!Number.isFinite(amount)) {
        throw httpError(400, 'Invalid WeChat Pay total_fee');
      }

      return {
        kind: 'paid',
        provider: this.code,
        orderNo: payload.out_trade_no || context.order.orderNo,
        providerOrderId: payload.transaction_id,
        amount,
        currency: 'CNY',
        paidAt: this.parsePaidAt(payload.time_end),
        payload: normalizedPayload
      };
    }

    if (tradeState === 'NOTPAY' || tradeState === 'USERPAYING') {
      return {
        kind: 'pending',
        provider: this.code,
        orderNo: payload.out_trade_no || context.order.orderNo,
        providerOrderId: payload.transaction_id ?? null,
        payload: normalizedPayload,
        reason: payload.trade_state_desc ?? tradeState
      };
    }

    return {
      kind: 'closed',
      provider: this.code,
      orderNo: payload.out_trade_no || context.order.orderNo,
      providerOrderId: payload.transaction_id ?? null,
      payload: normalizedPayload,
      reason: payload.trade_state_desc ?? tradeState
    };
  }
}
