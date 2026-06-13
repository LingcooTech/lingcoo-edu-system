import {
  createPaymentIntent,
  createSeatReservation,
  createWechatMiniPaymentIntent,
  fetchTrialSession,
  hasToken,
  mockPayOrder,
  submitTrialRegistration,
  syncOrderPayment,
  type ParentOrder,
  type PaymentIntent,
  type TrialDetail,
} from '../../services/api';
import { requestSubscribe } from '../../services/subscribe';
import { formatDateTime, money } from '../../utils/format';

type ReservationOrder = ParentOrder & { amountLabel: string; statusLabel: string };

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待支付',
    paid: '已支付',
    cancelled: '已取消',
    refunded: '已退款',
  };
  return labels[status] || status;
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value);
}

function requestWechatPayment(intent: PaymentIntent): Promise<void> {
  const timeStamp = payloadString(intent.payload, 'timeStamp');
  const nonceStr = payloadString(intent.payload, 'nonceStr');
  const packageValue = payloadString(intent.payload, 'package');
  const signType = payloadString(intent.payload, 'signType') || 'HMAC-SHA256';
  const paySign = payloadString(intent.payload, 'paySign');

  if (!timeStamp || !nonceStr || !packageValue || !paySign) {
    return Promise.reject(new Error('微信支付参数不完整'));
  }

  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp,
      nonceStr,
      package: packageValue,
      signType,
      paySign,
      success: () => resolve(),
      fail: (error) => reject(new Error(error.errMsg || '微信支付失败')),
    });
  });
}

function prefillStorageKey(trialSessionId: string): string {
  return `trial_registration_prefill:${trialSessionId}`;
}

function readPrefill(trialSessionId: string) {
  const payload = wx.getStorageSync(prefillStorageKey(trialSessionId)) as
    | {
        guardianName?: string;
        phone?: string;
        studentName?: string;
        grade?: string;
      }
    | '';
  if (payload) {
    wx.removeStorageSync(prefillStorageKey(trialSessionId));
  }
  return payload || {};
}

import { shareCard, timelineCard } from '../../utils/share';

Page({
  data: {
    loading: true,
    notFound: false,
    trialSessionId: '',
    detail: null as TrialDetail | null,
    startsAtLabel: '',
    endsAtLabel: '',
    campusLabel: '',
    reservationFeeLabel: '',
    requiresReservationFee: false,
    full: false,
    submitting: false,
    paying: false,
    order: null as ReservationOrder | null,
    guardianName: '',
    phone: '',
    studentName: '',
    grade: '',
  },

  onLoad(options: { id?: string; trialSessionId?: string }) {
    const trialSessionId = options.id || options.trialSessionId || '';
    this.load(trialSessionId);
  },

  onShareAppMessage() {
    const session = this.data.detail && this.data.detail.trialSession;
    return shareCard(
      (session && session.title) || '公开课',
      `/pages/trial-detail/index?id=${this.data.trialSessionId || ''}`,
      session && session.coverImageUrl,
    );
  },

  onShareTimeline() {
    const session = this.data.detail && this.data.detail.trialSession;
    return timelineCard(
      (session && session.title) || '公开课',
      `id=${this.data.trialSessionId || ''}`,
      session && session.coverImageUrl,
    );
  },

  async load(trialSessionId: string) {
    if (!trialSessionId) {
      this.setData({ loading: false, notFound: true });
      return;
    }

    this.setData({ loading: true, notFound: false, trialSessionId });
    try {
      const detail = await fetchTrialSession(trialSessionId);
      wx.setNavigationBarTitle({ title: detail.trialSession.title });
      const prefill = readPrefill(trialSessionId);
      const requiresReservationFee =
        detail.organization.businessModel.seatReservationFeeEnabled &&
        detail.trialSession.reservationFeeAmount > 0;
      this.setData({
        loading: false,
        detail,
        startsAtLabel: formatDateTime(detail.trialSession.startsAt),
        endsAtLabel: formatDateTime(detail.trialSession.endsAt),
        campusLabel: detail.campus?.name || detail.organization.address || '地点待确认',
        reservationFeeLabel: detail.trialSession.reservationFeeAmount
          ? `${money(detail.trialSession.reservationFeeAmount)} 试听席位保留费`
          : '',
        requiresReservationFee,
        full: detail.trialSession.bookedCount >= detail.trialSession.capacity,
        guardianName: prefill.guardianName || '',
        phone: prefill.phone || '',
        studentName: prefill.studentName || '',
        grade: prefill.grade || '',
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  goAccount() {
    wx.switchTab({ url: '/pages/account/index' });
  },

  async onSubmit(event: {
    detail: {
      value: {
        guardianName?: string;
        phone?: string;
        studentName?: string;
        grade?: string;
      };
    };
  }) {
    const detail = this.data.detail;
    if (!detail || this.data.full) return;

    const value = event.detail.value;
    const guardianName = (value.guardianName || '').trim();
    const phone = (value.phone || '').trim();
    const studentName = (value.studentName || '').trim();
    const grade = (value.grade || '').trim();
    if (!guardianName || !phone || !studentName || !grade) {
      wx.showToast({ title: '请补全预约信息', icon: 'none' });
      return;
    }

    if (this.data.requiresReservationFee && !hasToken()) {
      wx.showModal({
        title: '请先登录',
        content: '支付试听席位保留费需要先在家长中心完成微信登录和手机号绑定。',
        confirmText: '去登录',
        success: (result) => {
          if (result.confirm) this.goAccount();
        },
      });
      return;
    }

    this.setData({ submitting: true });
    try {
      if (this.data.requiresReservationFee) {
        await requestSubscribe(['payment_success']);
        const payload = await createSeatReservation({
          trialSessionId: detail.trialSession.id,
          guardianName,
          phone,
          studentName,
          grade,
          source: 'mini_program',
          course: detail.course.slug,
          medium: 'wechat_mini_program',
        });
        const order: ReservationOrder = {
          ...payload.order,
          amountLabel: money(payload.order.amount),
          statusLabel: orderStatusLabel(payload.order.status),
        };
        this.setData({ order });
        await this.payCreatedOrder(order.orderNo);
        return;
      }

      await requestSubscribe(['trial_registration']);
      await submitTrialRegistration({
        trialSessionId: detail.trialSession.id,
        courseId: detail.course.id,
        guardianName,
        phone,
        studentName,
        grade,
        source: 'mini_program',
        course: detail.course.slug,
        medium: 'wechat_mini_program',
      });
      wx.showModal({
        title: '预约成功',
        content: '老师会尽快联系确认试听安排。',
        showCancel: false,
        success: () => this.goHome(),
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async payCreatedOrder(orderNo: string) {
    this.setData({ paying: true });
    try {
      try {
        const intent = await createWechatMiniPaymentIntent(orderNo);
        if (intent.nextAction === 'none' && intent.status === 'paid') {
          await this.finishPaidOrder(orderNo);
          return;
        }
        if (intent.nextAction !== 'request_payment') {
          throw new Error('微信支付参数未就绪');
        }

        await requestWechatPayment(intent);
        const paidOrder = await syncOrderPayment(orderNo);
        if (paidOrder.status !== 'paid') {
          throw new Error('支付结果同步中，请稍后在家长中心查看订单状态');
        }
        await this.finishPaidOrder(orderNo, paidOrder);
      } catch (error) {
        await this.offerMockPayment(orderNo, error instanceof Error ? error.message : '');
      }
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '支付失败',
        icon: 'none',
      });
    } finally {
      this.setData({ paying: false });
    }
  },

  onContinuePay(event: { currentTarget: { dataset: { orderNo?: string } } }) {
    const orderNo = event.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    this.payCreatedOrder(orderNo);
  },

  async offerMockPayment(orderNo: string, reason?: string) {
    const intent = await createPaymentIntent(orderNo, 'mock');
    if (!intent.configured || intent.nextAction !== 'mock_pay') {
      wx.showModal({
        title: '支付待处理',
        content: reason || '订单已创建，请稍后继续支付或联系老师处理。',
        showCancel: false,
      });
      return;
    }

    wx.showModal({
      title: '开发模拟支付',
      content: reason
        ? `${reason}\n\n当前可使用 mock-pay 完成开发环境验证。`
        : '当前可使用 mock-pay 完成开发环境验证，并保留试听席位。',
      confirmText: '模拟支付',
      success: async (result) => {
        if (!result.confirm) return;
        const paidOrder = await mockPayOrder(orderNo);
        await this.finishPaidOrder(orderNo, paidOrder);
      },
    });
  },

  async finishPaidOrder(orderNo: string, paidOrder?: ParentOrder) {
    const nextOrder = paidOrder
      ? {
          ...paidOrder,
          amountLabel: money(paidOrder.amount),
          statusLabel: orderStatusLabel(paidOrder.status),
        }
      : this.data.order
        ? { ...this.data.order, status: 'paid', statusLabel: '已支付' }
        : null;
    if (nextOrder) {
      this.setData({ order: nextOrder });
    }
    wx.showModal({
      title: '席位已保留',
      content: '试听席位保留费已支付，老师会按场次安排接待。',
      showCancel: true,
      confirmText: '回首页',
      success: (result) => {
        if (result.confirm) this.goHome();
      },
    });
    if (orderNo === this.data.order?.orderNo) {
      await this.load(this.data.trialSessionId);
    }
  },
});
