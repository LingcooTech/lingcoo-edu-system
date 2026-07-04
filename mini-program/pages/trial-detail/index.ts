import {
  createPaymentIntent,
  createSeatReservation,
  createWechatMiniPaymentIntent,
  fetchParentSeatReservations,
  fetchTrialSession,
  hasToken,
  mockPayOrder,
  setToken,
  submitTrialRegistration,
  syncOrderPayment,
  type ParentOrder,
  type PaymentIntent,
  type SeatReservation,
  type TrialDetail,
} from '../../services/api';
import { requestSubscribe } from '../../services/subscribe';
import { formatDateTime, money } from '../../utils/format';
import { toUserFacingMessage } from '../../utils/user-facing-message';

type ReservationOrder = ParentOrder & { amountLabel: string; statusLabel: string };
type PhoneWx = typeof wx & {
  makePhoneCall(options: { phoneNumber: string; fail?: () => void }): void;
};
type SheetTouchEvent = {
  changedTouches: Array<{ clientY: number }>;
};

function loginWechatMini(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (result) => {
        if (result.code) {
          resolve(result.code);
        } else {
          reject(new Error('登录失败'));
        }
      },
      fail: () => reject(new Error('登录失败')),
    });
  });
}

function extractPhone(value?: string | null): string {
  const match = (value || '').match(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}|0\d{2,3}[-\s]?\d{7,8}/);
  return match ? match[0].replace(/[\s-]/g, '') : '';
}

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待支付',
    paid: '已支付',
    cancelled: '已取消',
    refunded: '已退款',
  };
  return labels[status] || '未知状态';
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
    return Promise.reject(new Error('支付参数不完整'));
  }

  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp,
      nonceStr,
      package: packageValue,
      signType,
      paySign,
      success: () => resolve(),
      fail: (error) => reject(new Error(toUserFacingMessage(error.errMsg, '支付失败'))),
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

import {
  configuredShareTitle,
  enableShareMenu,
  shareCard,
  shareTitleWithInstitution,
  timelineCard,
} from '../../utils/share';

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
    seatReservation: null as SeatReservation | null,
    guardianName: '',
    phone: '',
    studentName: '',
    grade: '',
    showReservationForm: false,
    reservationSheetDragging: false,
    reservationSheetDragStartY: 0,
    reservationSheetOffset: 0,
    contactPhone: '',
  },

  onLoad(options: { id?: string; trialSessionId?: string }) {
    enableShareMenu();
    const trialSessionId = options.id || options.trialSessionId || '';
    this.load(trialSessionId);
  },

  onShareAppMessage() {
    const detail = this.data.detail;
    const session = detail && detail.trialSession;
    const title = shareTitleWithInstitution(
      configuredShareTitle('trialDetail', (session && session.title) || '预约试听'),
      detail?.providerInstitution?.name ||
        detail?.organization?.brandName ||
        detail?.organization?.name,
    );
    return shareCard(
      title,
      `/pages/trial-detail/index?id=${this.data.trialSessionId || ''}`,
      session && session.coverImageUrl,
    );
  },

  onShareTimeline() {
    const detail = this.data.detail;
    const session = detail && detail.trialSession;
    const title = shareTitleWithInstitution(
      configuredShareTitle('trialDetail', (session && session.title) || '预约试听'),
      detail?.providerInstitution?.name ||
        detail?.organization?.brandName ||
        detail?.organization?.name,
    );
    return timelineCard(
      title,
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
        contactPhone: extractPhone(
          detail.providerInstitution?.contact || detail.organization.phone,
        ),
        requiresReservationFee,
        full: detail.trialSession.bookedCount >= detail.trialSession.capacity,
        guardianName: prefill.guardianName || '',
        phone: prefill.phone || '',
        studentName: prefill.studentName || '',
        grade: prefill.grade || '',
        showReservationForm: Boolean(
          prefill.guardianName || prefill.phone || prefill.studentName || prefill.grade,
        ),
        reservationSheetDragging: false,
        reservationSheetDragStartY: 0,
        reservationSheetOffset: 0,
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

  onReserveTap() {
    if (this.data.full) {
      wx.showToast({ title: '名额已满', icon: 'none' });
      return;
    }
    this.setData({
      showReservationForm: true,
      reservationSheetDragging: false,
      reservationSheetDragStartY: 0,
      reservationSheetOffset: 0,
    });
  },

  onPhoneTap() {
    const phoneNumber = this.data.contactPhone;
    if (!phoneNumber) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }
    (wx as PhoneWx).makePhoneCall({
      phoneNumber,
      fail: () => wx.showToast({ title: '拨号失败', icon: 'none' }),
    });
  },

  closeReservationForm() {
    if (this.data.submitting || this.data.paying) return;
    this.setData({
      showReservationForm: false,
      reservationSheetDragging: false,
      reservationSheetDragStartY: 0,
      reservationSheetOffset: 0,
    });
  },

  noop() {
    return;
  },

  onFormFieldInput(event: {
    currentTarget: { dataset: { field?: string } };
    detail: { value?: string };
  }) {
    const field = event.currentTarget.dataset.field;
    if (!['guardianName', 'phone', 'studentName', 'grade'].includes(field || '')) return;
    this.setData({ [field as string]: event.detail.value || '' });
  },

  onReservationSheetTouchStart(event: SheetTouchEvent) {
    if (this.data.submitting || this.data.paying) return;
    const touch = event.changedTouches[0];
    this.setData({
      reservationSheetDragging: true,
      reservationSheetDragStartY: touch ? touch.clientY : 0,
      reservationSheetOffset: 0,
    });
  },

  onReservationSheetTouchMove(event: SheetTouchEvent) {
    if (!this.data.reservationSheetDragging || this.data.submitting || this.data.paying) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const offset = Math.max(0, touch.clientY - this.data.reservationSheetDragStartY);
    this.setData({ reservationSheetOffset: Math.min(offset, 260) });
  },

  onReservationSheetTouchEnd() {
    if (!this.data.reservationSheetDragging) return;
    if (this.data.reservationSheetOffset >= 72) {
      this.closeReservationForm();
      return;
    }
    this.setData({
      reservationSheetDragging: false,
      reservationSheetDragStartY: 0,
      reservationSheetOffset: 0,
    });
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

    if (this.data.requiresReservationFee) {
      wx.showToast({ title: '请授权手机号后支付', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
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
        content: '工作人员会尽快联系确认试听安排。',
        showCancel: false,
        success: () => {
          this.setData({ showReservationForm: false });
          this.goHome();
        },
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

  async onReservationPhoneAuth(event: { detail: { code?: string; errMsg?: string } }) {
    const detail = this.data.detail;
    if (!detail || this.data.full || this.data.submitting || this.data.paying) return;
    const phoneCode = event.detail.code;
    if (!phoneCode) {
      wx.showToast({ title: '需要授权手机号后继续支付', icon: 'none' });
      return;
    }

    const guardianName = (this.data.guardianName || '').trim();
    const studentName = (this.data.studentName || '').trim();
    const grade = (this.data.grade || '').trim();
    if (!guardianName || !studentName || !grade) {
      wx.showToast({ title: '请补全预约信息', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const wechatMiniCode = await loginWechatMini();
      const payload = await createSeatReservation({
        trialSessionId: detail.trialSession.id,
        guardianName,
        phoneCode,
        studentName,
        grade,
        source: 'mini_program',
        course: detail.course.slug,
        medium: 'wechat_mini_program',
        wechatMiniCode,
      });
      if (payload.checkout?.authToken) {
        setToken(payload.checkout.authToken);
      }
      if (hasToken()) {
        await requestSubscribe(['payment_success']);
      }
      const order: ReservationOrder = {
        ...payload.order,
        amountLabel: money(payload.order.amount),
        statusLabel: orderStatusLabel(payload.order.status),
      };
      this.setData({ order, seatReservation: payload.seatReservation });
      await this.payCreatedOrder(order.orderNo);
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
          throw new Error('支付参数未就绪');
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
        ? `${reason}\n\n当前可使用模拟支付完成开发环境验证。`
        : '当前可使用模拟支付完成开发环境验证，并保留试听席位。',
      confirmText: '模拟支付',
      success: async (result) => {
        if (!result.confirm) return;
        const paidOrder = await mockPayOrder(orderNo);
        await this.finishPaidOrder(orderNo, paidOrder);
      },
    });
  },

  async refreshSeatReservation(orderNo: string) {
    if (!hasToken()) return this.data.seatReservation;
    const reservations = await fetchParentSeatReservations();
    const reservation = reservations.find((item) => item.orderNo === orderNo) || null;
    if (reservation) {
      this.setData({ seatReservation: reservation });
    }
    return reservation || this.data.seatReservation;
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
    const seatReservation = await this.refreshSeatReservation(orderNo);
    if (seatReservation && seatReservation.reservationStatus !== 'reserved') {
      wx.showModal({
        title: '支付已完成',
        content:
          seatReservation.reservationStatus === 'cancelled'
            ? '当前试听名额暂未保留成功，工作人员会尽快联系您改期或处理退款。'
            : '支付结果已确认，席位状态同步中，请稍后在家长中心查看。',
        showCancel: false,
        success: () => {
          this.setData({ showReservationForm: false });
          this.goAccount();
        },
      });
      return;
    }
    wx.showModal({
      title: '席位已保留',
      content: '试听席位保留费已支付，工作人员会按场次安排接待。',
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
