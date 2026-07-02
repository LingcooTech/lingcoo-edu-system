import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as financeRepo from '../../db/repositories/finance.js';
import type { Order } from '../../db/repositories/finance.js';
import * as schema from '../../db/schema.js';
import { httpError } from '../../lib/http-error.js';
import {
  getWechatMiniSubscribeTemplateId,
  sendWechatMiniSubscribeMessage,
} from '../../lib/wechat-mini.js';
import { NotificationsService } from '../notifications/service.js';
import { notifyTeachersTrialSeatReserved } from '../teacher-notification-events.js';
import { getPaymentProvider } from './providers/index.js';
import type {
  LivePaymentProviderCode,
  PaymentIntent,
  PaymentNotificationResult,
  PaymentProviderCode,
} from './providers/types.js';
import { PaymentSettingsService } from './settings-service.js';

function isLiveProvider(provider: string): provider is LivePaymentProviderCode {
  return provider === 'wechat_pay' || provider === 'alipay';
}

function buildOrderSubject(order: Order) {
  if (order.orderType === 'seat_reservation') {
    return `试听席位保留费 ${order.orderNo}`;
  }
  return `课时包订单 ${order.orderNo}（${order.lessonCount} 课时）`;
}

function formatAmount(amount: number) {
  return `￥${(amount / 100).toFixed(2)}`;
}

function formatMessageTime(date = new Date()) {
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function notPayableReason(order: Order) {
  return `Order is ${order.status} and cannot be paid`;
}

async function attachQrCodeDataUrl(intent: PaymentIntent): Promise<PaymentIntent> {
  if (intent.nextAction !== 'render_qr') {
    return intent;
  }

  const qrCodeText = String(
    intent.payload.qrCodeText ?? intent.payload.codeUrl ?? intent.payload.qrCode ?? '',
  ).trim();
  if (!qrCodeText) {
    throw httpError(500, 'Payment provider did not return a QR code');
  }

  return {
    ...intent,
    payload: {
      ...intent.payload,
      qrCodeText,
      codeUrl: String(intent.payload.codeUrl ?? qrCodeText),
      qrCodeDataUrl: await QRCode.toDataURL(qrCodeText, {
        margin: 1,
        width: 280,
      }),
    },
  };
}

/**
 * Orchestrates payment for public checkout orders: builds a provider payment
 * intent (mock / WeChat / Alipay), handles the idempotent settlement on
 * callback or reconciliation, and fires the parent notification. All money
 * mutations route through the transactional `financeRepo.markOrderPaidAndCredit`.
 */
export class PaymentService {
  constructor(private readonly app: FastifyInstance) {}

  listPaymentProviders() {
    return new PaymentSettingsService(this.app).getOverview({ includeMock: true });
  }

  async createPaymentIntent(input: {
    orderNo: string;
    provider?: PaymentProviderCode;
    clientIp?: string;
  }) {
    const provider = input.provider ?? 'mock';
    const order = await financeRepo.findOrderByOrderNo(this.app.db, input.orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (order.status === 'paid') {
      return { item: this.buildPaidIntent(order, provider) };
    }

    if (order.status !== 'pending') {
      throw httpError(409, notPayableReason(order));
    }

    if (provider === 'mock') {
      return this.createMockIntent(order);
    }

    if (!isLiveProvider(provider)) {
      throw httpError(422, `Unsupported payment provider: ${provider}`);
    }

    const adapter = getPaymentProvider(provider);
    const runtimeEnv = await new PaymentSettingsService(this.app).buildRuntimeEnv();
    if (!adapter.isConfigured(runtimeEnv)) {
      throw httpError(422, `${adapter.label} is not configured`);
    }

    const intent = await adapter.preparePayment({
      env: runtimeEnv,
      clientIp: input.clientIp,
      order: {
        orderNo: order.orderNo,
        subject: buildOrderSubject(order),
        amount: order.amount,
        currency: order.currency,
      },
    });

    await financeRepo.markPaymentPrepared(this.app.db, order.orderNo, provider);

    return { item: await attachQrCodeDataUrl(intent) };
  }

  async createWechatMiniProgramPaymentIntent(input: {
    orderNo: string;
    accountId: string;
    clientIp?: string;
  }) {
    const order = await financeRepo.findOrderByOrderNo(this.app.db, input.orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }
    if (order.accountId !== input.accountId) {
      throw httpError(403, '只能支付本人账号下的订单');
    }
    if (order.status === 'paid') {
      return { item: this.buildPaidIntent(order, 'wechat_pay') };
    }
    if (order.status !== 'pending') {
      throw httpError(409, notPayableReason(order));
    }

    const adapter = getPaymentProvider('wechat_pay');
    const runtimeEnv = await new PaymentSettingsService(this.app).buildRuntimeEnv();
    if (!adapter.isConfigured(runtimeEnv)) {
      throw httpError(422, `${adapter.label} is not configured`);
    }
    if (!adapter.prepareMiniProgramPayment) {
      throw httpError(422, `${adapter.label} does not support Mini Program payment`);
    }

    const appId = runtimeEnv.WECHAT_PAY_APP_ID?.trim();
    if (!appId) {
      throw httpError(422, 'WECHAT_PAY_APP_ID is not configured');
    }

    const identity = await accountsRepo.findWechatIdentityByAccount(
      this.app.db,
      input.accountId,
      appId,
    );
    if (!identity) {
      throw httpError(422, '当前账号未绑定该小程序微信身份，请先在小程序使用微信登录绑定手机号');
    }

    const intent = await adapter.prepareMiniProgramPayment({
      env: runtimeEnv,
      clientIp: input.clientIp,
      openid: identity.openid,
      order: {
        orderNo: order.orderNo,
        subject: buildOrderSubject(order),
        amount: order.amount,
        currency: order.currency,
      },
    });

    await financeRepo.markPaymentPrepared(this.app.db, order.orderNo, 'wechat_pay');

    return { item: intent };
  }

  private createMockIntent(order: Order) {
    const intent: PaymentIntent = {
      orderNo: order.orderNo,
      provider: 'mock',
      amount: order.amount,
      currency: order.currency,
      mode: 'mock_mini_program',
      status: order.status === 'paid' ? 'paid' : 'pending_payment',
      configured: this.app.appEnv.NODE_ENV !== 'production',
      integrationStatus: this.app.appEnv.NODE_ENV === 'production' ? 'not_configured' : 'mock',
      nextAction: order.status === 'paid' ? 'none' : 'mock_pay',
      nextStep: 'Development only: call mock-pay to mark this order as paid.',
      payload: {},
    };

    return { item: intent };
  }

  async markMockPaid(input: { orderNo: string }) {
    if (this.app.appEnv.NODE_ENV === 'production') {
      throw httpError(404, 'Mock payment is disabled in production');
    }

    const order = await financeRepo.findOrderByOrderNo(this.app.db, input.orderNo);
    if (!order) {
      throw httpError(404, 'Order not found');
    }

    const result = await financeRepo.markOrderPaidAndCredit(this.app.db, {
      orderNo: order.orderNo,
      provider: 'mock',
      providerOrderId: `mock_${order.orderNo}`,
      providerEventId: `mock_${order.orderNo}`,
      amount: order.amount,
      currency: order.currency,
      paidAt: new Date(),
      raw: { source: 'mock' },
    });

    // Idempotent: a repeated mock-pay returns success but skips the second
    // notification (the order was already paid).
    if (!result.alreadyPaid) {
      await this.notifyPaid(result.order, 'mock', `mock_${order.orderNo}`);
    }

    return { item: result.order };
  }

  async handlePaymentNotification(
    notification: Extract<PaymentNotificationResult, { kind: 'paid' }>,
  ) {
    const result = await financeRepo.markOrderPaidAndCredit(this.app.db, {
      orderNo: notification.orderNo,
      provider: notification.provider,
      providerOrderId: notification.providerOrderId,
      providerEventId: notification.providerEventId,
      amount: notification.amount,
      currency: notification.currency,
      paidAt: notification.paidAt,
      raw: notification.payload,
    });

    // Duplicate provider callback for an already-paid order: ACK it (so the
    // provider stops retrying) without double-firing the notification.
    if (result.alreadyPaid) {
      return { order: result.order, alreadyPaid: true as const };
    }

    await this.notifyPaid(result.order, notification.provider, notification.providerOrderId);

    return { order: result.order, alreadyPaid: false as const };
  }

  async syncProviderPayment(input: { orderNo: string }) {
    const order = await financeRepo.findOrderByOrderNo(this.app.db, input.orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (order.status === 'paid') {
      return {
        changed: false,
        item: order,
        reconciliation: {
          status: 'paid',
          source: 'current_state',
          reason: 'Order already marked as paid',
        },
      };
    }

    if (order.status !== 'pending') {
      return {
        changed: false,
        item: order,
        reconciliation: {
          status: order.status,
          source: 'current_state',
          reason: notPayableReason(order),
        },
      };
    }

    const providerCode = order.paymentProvider;
    if (!providerCode || !isLiveProvider(providerCode)) {
      throw httpError(422, 'Order has no live payment provider to sync');
    }

    const adapter = getPaymentProvider(providerCode);
    const runtimeEnv = await new PaymentSettingsService(this.app).buildRuntimeEnv();
    const query = await adapter.queryPayment({
      env: runtimeEnv,
      order: {
        orderNo: order.orderNo,
        subject: buildOrderSubject(order),
        amount: order.amount,
        currency: order.currency,
        providerOrderId: order.providerOrderId,
      },
    });

    if (query.kind === 'paid') {
      const result = await this.handlePaymentNotification({
        ...query,
        providerEventId: `query_paid:${query.provider}:${query.providerOrderId}:${query.orderNo}`,
      });

      return {
        changed: !result.alreadyPaid,
        item: result.order,
        reconciliation: {
          status: 'paid',
          source: 'provider_query',
          reason: result.alreadyPaid
            ? 'Provider query confirmed payment (already recorded)'
            : 'Provider query confirmed payment',
        },
      };
    }

    return {
      changed: false,
      item: order,
      reconciliation: {
        status: query.kind,
        source: 'provider_query',
        reason: query.reason,
      },
    };
  }

  private async notifyPaid(order: Order, provider: PaymentProviderCode, providerOrderId: string) {
    if (!order.accountId) {
      return;
    }
    const isSeatReservation = order.orderType === 'seat_reservation';
    const seatReservation = isSeatReservation
      ? await this.findSeatReservation(order.orderNo)
      : null;
    const seatReserved = seatReservation?.reservationStatus === 'reserved';

    await new NotificationsService(this.app.db).create({
      recipientType: 'parent',
      recipientId: order.accountId,
      category: 'payment',
      level: 'success',
      title: '支付成功',
      body: isSeatReservation
        ? seatReserved
          ? `订单 ${order.orderNo} 已支付，试听席位已保留。`
          : `订单 ${order.orderNo} 已支付，试听席位待老师确认。`
        : order.studentId
          ? `订单 ${order.orderNo} 已支付，${order.lessonCount} 课时已到账。`
          : `订单 ${order.orderNo} 已支付，请完善孩子信息后开通课时。`,
      ctaLabel: '查看订单',
      ctaUrl: '/account',
      sourceEventName: 'payment.paid',
      dedupeKey: `payment.paid:${order.orderNo}:${provider}:${providerOrderId}`,
    });
    if (isSeatReservation && seatReservation?.courseId && seatReserved) {
      const trialSession = seatReservation.trialSessionId
        ? await this.findTrialSession(seatReservation.trialSessionId)
        : null;
      await notifyTeachersTrialSeatReserved(this.app.db, {
        orderNo: order.orderNo,
        seatReservationId: seatReservation.id,
        trialSessionId: seatReservation.trialSessionId,
        studentName: seatReservation.studentName,
        courseId: seatReservation.courseId,
        startsAt: trialSession?.startsAt ?? null,
      });
    }
    await this.sendWechatMiniPaymentSubscribe(order);
  }

  private async findSeatReservation(orderNo: string) {
    const [reservation] = await this.app.db
      .select()
      .from(schema.seatReservations)
      .where(eq(schema.seatReservations.orderNo, orderNo))
      .limit(1);
    return reservation ?? null;
  }

  private async findTrialSession(trialSessionId: string) {
    const [trialSession] = await this.app.db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, trialSessionId))
      .limit(1);
    return trialSession ?? null;
  }

  private async sendWechatMiniPaymentSubscribe(order: Order) {
    const templateId = getWechatMiniSubscribeTemplateId(this.app.appEnv, 'payment_success');
    const appId = this.app.appEnv.WECHAT_MINI_PROGRAM_APP_ID?.trim();
    if (!templateId || !appId || !order.accountId) {
      return;
    }

    const identity = await accountsRepo.findWechatIdentityByAccount(
      this.app.db,
      order.accountId,
      appId,
    );
    if (!identity) {
      return;
    }
    const seatReservation =
      order.orderType === 'seat_reservation' ? await this.findSeatReservation(order.orderNo) : null;
    const seatReserved = seatReservation?.reservationStatus === 'reserved';

    try {
      const result = await sendWechatMiniSubscribeMessage(this.app.appEnv, {
        toUser: identity.openid,
        templateId,
        page: '/pages/account/index',
        data: {
          character_string2: { value: order.orderNo },
          amount11: { value: formatAmount(order.amount) },
          thing9: {
            value:
              order.orderType === 'seat_reservation'
                ? seatReserved
                  ? '试听席位已保留'
                  : '试听席位待确认'
                : order.studentId
                  ? `${order.lessonCount} 课时已到账`
                  : '待完善孩子信息',
          },
          time8: { value: formatMessageTime(order.paidAt ?? new Date()) },
        },
      });
      if (!result.sent) {
        this.app.log.info(
          { orderNo: order.orderNo, errcode: result.errcode, errmsg: result.errmsg },
          'wechat mini payment subscribe skipped',
        );
      }
    } catch (error) {
      this.app.log.warn(
        { err: error, orderNo: order.orderNo },
        'wechat mini payment subscribe failed',
      );
    }
  }

  private buildPaidIntent(order: Order, requestedProvider: PaymentProviderCode): PaymentIntent {
    const provider = (order.paymentProvider as PaymentProviderCode | null) ?? requestedProvider;

    return {
      orderNo: order.orderNo,
      provider,
      amount: order.amount,
      currency: order.currency,
      mode:
        provider === 'alipay'
          ? 'page_redirect'
          : provider === 'wechat_pay'
            ? 'native_qr'
            : 'mock_mini_program',
      status: 'paid',
      configured: true,
      integrationStatus: provider === 'mock' ? 'mock' : 'live',
      nextAction: 'none',
      nextStep: 'Order is already paid.',
      payload: {
        providerOrderId: order.providerOrderId ?? '',
      },
    };
  }
}
