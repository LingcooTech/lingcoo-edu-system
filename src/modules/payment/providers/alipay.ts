import { AlipaySdk } from 'alipay-sdk';

import { httpError } from '../../../lib/http-error.js';
import {
  amountFenToYuanString,
  amountYuanStringToFen,
  fileSecretConfigured,
  normalizeFormBody,
  parseRawFormBody,
  readSecretValue,
  resolveCallbackUrl,
  resolvePublicBaseUrl,
  secretConfigured
} from './shared.js';
import type {
  PaymentNotificationResult,
  PaymentProviderAdapter,
  PaymentQueryResult,
  ProviderContext,
  ProviderNotificationContext,
  ProviderQueryContext
} from './types.js';

const ALIPAY_NOTIFY_PATH = '/public/payment/alipay/notify';
const ALIPAY_DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do';

export class AlipayProvider implements PaymentProviderAdapter {
  code = 'alipay' as const;
  label = '支付宝';

  isConfigured(env?: ProviderContext['env']) {
    if (!env) {
      return false;
    }

    return Boolean(
      env.ALIPAY_APP_ID?.trim() &&
        (secretConfigured(env.ALIPAY_PRIVATE_KEY) || fileSecretConfigured(env.ALIPAY_PRIVATE_KEY_PATH)) &&
        (secretConfigured(env.ALIPAY_PUBLIC_KEY) || fileSecretConfigured(env.ALIPAY_PUBLIC_KEY_PATH))
    );
  }

  getOverview(env: ProviderContext['env']) {
    return {
      notifyUrl: this.getNotifyUrl(env),
      values: {
        appId: env.ALIPAY_APP_ID?.trim() ?? '',
        gateway: env.ALIPAY_GATEWAY?.trim() || ALIPAY_DEFAULT_GATEWAY,
        keyType: env.ALIPAY_KEY_TYPE ?? 'PKCS1',
        f2fPay: env.ALIPAY_F2F_PAY ?? false
      },
      secrets: {
        privateKeyPem: {
          configured: secretConfigured(env.ALIPAY_PRIVATE_KEY) || fileSecretConfigured(env.ALIPAY_PRIVATE_KEY_PATH)
        },
        publicKeyPem: {
          configured: secretConfigured(env.ALIPAY_PUBLIC_KEY) || fileSecretConfigured(env.ALIPAY_PUBLIC_KEY_PATH)
        }
      }
    };
  }

  private getSdk(env: ProviderContext['env'] | ProviderNotificationContext['env'] | ProviderQueryContext['env']) {
    return new AlipaySdk({
      appId: env.ALIPAY_APP_ID!.trim(),
      privateKey: readSecretValue({
        inlineValue: env.ALIPAY_PRIVATE_KEY,
        filePath: env.ALIPAY_PRIVATE_KEY_PATH,
        label: 'ALIPAY_PRIVATE_KEY'
      }),
      alipayPublicKey: readSecretValue({
        inlineValue: env.ALIPAY_PUBLIC_KEY,
        filePath: env.ALIPAY_PUBLIC_KEY_PATH,
        label: 'ALIPAY_PUBLIC_KEY'
      }),
      gateway: env.ALIPAY_GATEWAY?.trim() || undefined,
      keyType: env.ALIPAY_KEY_TYPE ?? 'PKCS1'
    });
  }

  private getNotifyUrl(env: ProviderContext['env']) {
    return resolveCallbackUrl(
      env.ALIPAY_NOTIFY_URL,
      resolvePublicBaseUrl({ publicBaseUrl: env.PUBLIC_BASE_URL, appBaseUrl: env.APP_BASE_URL }),
      ALIPAY_NOTIFY_PATH
    );
  }

  private isF2FEnabled(env: ProviderContext['env']) {
    return env.ALIPAY_F2F_PAY === true;
  }

  private parsePaidAt(value: string | undefined) {
    if (!value) {
      return new Date();
    }

    const normalized = value.trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
      return new Date(normalized);
    }

    return new Date(`${normalized.replace(' ', 'T')}+08:00`);
  }

  async preparePayment(context: ProviderContext) {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'Alipay is not configured');
    }

    if (context.order.currency !== 'CNY') {
      throw httpError(422, 'Alipay only supports CNY');
    }

    const notifyUrl = this.getNotifyUrl(context.env);

    if (this.isF2FEnabled(context.env)) {
      const result = await this.getSdk(context.env).exec('alipay.trade.precreate', {
        notifyUrl,
        bizContent: {
          outTradeNo: context.order.orderNo,
          subject: context.order.subject,
          body: context.order.subject,
          totalAmount: amountFenToYuanString(context.order.amount)
        }
      });
      const qrCode =
        typeof result.qrCode === 'string'
          ? result.qrCode
          : typeof result.qr_code === 'string'
            ? result.qr_code
            : '';

      if (result.code !== '10000' || !qrCode) {
        throw httpError(
          502,
          `Alipay create order failed: ${result.code ?? 'unknown'} ${result.sub_msg ?? result.msg ?? 'empty response'}`
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
        nextStep: 'Render payload.qrCodeText as a QR code. The order is marked paid after the Alipay async notify.',
        payload: {
          qrCode,
          qrCodeText: qrCode,
          codeUrl: qrCode
        }
      } as const;
    }

    const pageParams: {
      method: 'GET';
      notifyUrl: string;
      returnUrl?: string;
      bizContent: {
        outTradeNo: string;
        productCode: string;
        subject: string;
        body: string;
        totalAmount: string;
      };
    } = {
      method: 'GET',
      notifyUrl,
      bizContent: {
        outTradeNo: context.order.orderNo,
        productCode: 'FAST_INSTANT_TRADE_PAY',
        subject: context.order.subject,
        body: context.order.subject,
        totalAmount: amountFenToYuanString(context.order.amount)
      }
    };

    const returnUrl = context.env.ALIPAY_RETURN_URL?.trim();
    if (returnUrl) {
      pageParams.returnUrl = returnUrl;
    }

    const checkoutUrl = this.getSdk(context.env).pageExecute('alipay.trade.page.pay', pageParams);

    return {
      orderNo: context.order.orderNo,
      provider: this.code,
      amount: context.order.amount,
      currency: context.order.currency,
      mode: 'page_redirect',
      status: 'pending_payment',
      configured: true,
      integrationStatus: 'live',
      notifyUrl,
      nextAction: 'redirect',
      nextStep: 'Open payload.checkoutUrl in a browser. The order is marked paid after the Alipay async notify.',
      payload: {
        checkoutUrl
      }
    } as const;
  }

  async parseNotification(context: ProviderNotificationContext): Promise<PaymentNotificationResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'Alipay is not configured');
    }

    const rawBody = typeof context.rawBody === 'string' ? context.rawBody : context.rawBody?.toString('utf8') ?? '';
    if (!rawBody) {
      throw httpError(400, 'Missing Alipay callback body');
    }

    const rawForm = parseRawFormBody(rawBody);
    const verified = this.getSdk(context.env).checkNotifySignV2(rawForm);
    if (!verified) {
      throw httpError(400, 'Invalid Alipay callback signature');
    }

    const form = normalizeFormBody(context.body);
    const providerEventId = form.notify_id || form.trade_no || form.out_trade_no || `alipay_${Date.now()}`;

    if (form.app_id && form.app_id !== context.env.ALIPAY_APP_ID) {
      throw httpError(400, 'Alipay app id mismatch');
    }

    if (form.trade_status !== 'TRADE_SUCCESS' && form.trade_status !== 'TRADE_FINISHED') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId,
        payload: form,
        reason: `Unhandled Alipay trade status: ${form.trade_status ?? 'unknown'}`
      };
    }

    if (!form.out_trade_no || !form.trade_no || !form.total_amount) {
      throw httpError(400, 'Missing Alipay payment fields');
    }

    return {
      kind: 'paid',
      provider: this.code,
      providerEventId,
      orderNo: form.out_trade_no,
      providerOrderId: form.trade_no,
      amount: amountYuanStringToFen(form.total_amount),
      currency: 'CNY',
      paidAt: this.parsePaidAt(form.gmt_payment),
      payload: form
    };
  }

  async queryPayment(context: ProviderQueryContext): Promise<PaymentQueryResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'Alipay is not configured');
    }

    const result = await this.getSdk(context.env).exec('alipay.trade.query', {
      bizContent: {
        outTradeNo: context.order.orderNo,
        tradeNo: context.order.providerOrderId?.trim() || undefined
      }
    });
    const payload = result as Record<string, unknown>;
    const tradeStatus =
      typeof result.tradeStatus === 'string'
        ? result.tradeStatus
        : typeof result.trade_status === 'string'
          ? result.trade_status
          : '';
    const tradeNo =
      typeof result.tradeNo === 'string'
        ? result.tradeNo
        : typeof result.trade_no === 'string'
          ? result.trade_no
          : null;
    const outTradeNo =
      typeof result.outTradeNo === 'string'
        ? result.outTradeNo
        : typeof result.out_trade_no === 'string'
          ? result.out_trade_no
          : context.order.orderNo;
    const totalAmount =
      typeof result.totalAmount === 'string'
        ? result.totalAmount
        : typeof result.total_amount === 'string'
          ? result.total_amount
          : '';
    const sendPayDate =
      typeof result.sendPayDate === 'string'
        ? result.sendPayDate
        : typeof result.send_pay_date === 'string'
          ? result.send_pay_date
          : '';
    const subMsg =
      typeof result.subMsg === 'string'
        ? result.subMsg
        : typeof result.sub_msg === 'string'
          ? result.sub_msg
          : '';
    const msg = typeof result.msg === 'string' ? result.msg : '';

    if (result.code === '10000' && (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED')) {
      if (!totalAmount || !tradeNo) {
        throw httpError(400, 'Missing Alipay query payment fields');
      }

      return {
        kind: 'paid',
        provider: this.code,
        orderNo: outTradeNo,
        providerOrderId: tradeNo,
        amount: amountYuanStringToFen(totalAmount),
        currency: 'CNY',
        paidAt: this.parsePaidAt(sendPayDate),
        payload
      };
    }

    if (result.code === '10000' && tradeStatus === 'WAIT_BUYER_PAY') {
      return {
        kind: 'pending',
        provider: this.code,
        orderNo: outTradeNo,
        providerOrderId: tradeNo,
        payload,
        reason: tradeStatus
      };
    }

    if (result.code === '10000' && tradeStatus === 'TRADE_CLOSED') {
      return {
        kind: 'closed',
        provider: this.code,
        orderNo: outTradeNo,
        providerOrderId: tradeNo,
        payload,
        reason: tradeStatus
      };
    }

    if (result.code === '40004') {
      return {
        kind: 'not_found',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId: tradeNo,
        payload,
        reason: subMsg || 'Order not found in Alipay'
      };
    }

    throw httpError(502, `Alipay query order failed: ${result.code ?? 'unknown'} ${subMsg || msg || 'empty response'}`);
  }
}
