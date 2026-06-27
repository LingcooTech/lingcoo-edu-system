import {
  createPaymentIntent,
  createPublicOrder,
  createWechatMiniPaymentIntent,
  fetchCourse,
  hasToken,
  mockPayOrder,
  submitTrialRegistration,
  syncOrderPayment,
  type Course,
  type CoursePackage,
  type BusinessModelSettings,
  type PublicCampus,
  type PublicInstitution,
  type PublicTeacher,
  type ParentOrder,
  type PaymentIntent,
} from '../../services/api';
import { money } from '../../utils/format';
import { parseBlocks, type Block } from '../../utils/blocks';
import { requestSubscribe } from '../../services/subscribe';

type PackageItem = CoursePackage & {
  priceLabel: string;
  lessonLabel: string;
  originalPriceLabel: string;
};
type CheckoutOrder = ParentOrder & { amountLabel: string; statusLabel: string };

function packagePriceAmount(pkg: CoursePackage): number {
  return pkg.discountPriceAmount ?? pkg.priceAmount;
}

function packageLessonLabel(pkg: CoursePackage): string {
  return pkg.giftedLessonCount
    ? `${pkg.lessonCount} 课时 + 赠 ${pkg.giftedLessonCount} 课时`
    : `${pkg.lessonCount} 课时`;
}

function campusLabel(campuses: PublicCampus[]): string {
  return campuses.length ? campuses.map((campus) => campus.name).join(' / ') : '到店确认';
}

function mergeNotice(trialDescription?: string, reservationNotice?: string): string {
  const parts = [trialDescription, reservationNotice]
    .map((item) => (item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join('\n\n');
}

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

import { shareCard, timelineCard } from '../../utils/share';

Page({
  data: {
    loading: true,
    notFound: false,
    course: null as Course | null,
    businessModel: null as BusinessModelSettings | null,
    providerInstitution: null as PublicInstitution | null,
    defaultTeacher: null as PublicTeacher | null,
    paymentReceiverInstitution: null as PublicInstitution | null,
    onlinePackageSalesAllowed: true,
    providerLabel: '',
    teacherLabel: '',
    locationLabel: '',
    trialNotice: '',
    receiverLabel: '',
    packages: [] as PackageItem[],
    contentBlocks: [] as Block[],
    showTrialForm: false,
    submittingTrial: false,
    showCheckoutForm: false,
    submittingOrder: false,
    payingOrder: false,
    selectedPackage: null as PackageItem | null,
    checkoutOrder: null as CheckoutOrder | null,
    checkoutDefaultPassword: '',
  },

  onLoad(options: { slug?: string }) {
    this.load(options.slug || '');
  },

  onShareAppMessage() {
    const course = this.data.course;
    return shareCard(
      (course && course.name) || '课程详情',
      `/pages/course-detail/index?slug=${(course && course.slug) || ''}`,
      course && course.coverImageUrl,
    );
  },

  onShareTimeline() {
    const course = this.data.course;
    return timelineCard(
      (course && course.name) || '课程详情',
      `slug=${(course && course.slug) || ''}`,
      course && course.coverImageUrl,
    );
  },

  async load(slug: string) {
    if (!slug) {
      this.setData({ loading: false, notFound: true });
      return;
    }

    this.setData({ loading: true, notFound: false });
    try {
      const payload = await fetchCourse(slug);
      wx.setNavigationBarTitle({ title: payload.course.name });
      const onlinePackageSalesAllowed =
        Boolean(payload.businessModel.onlinePackageSalesEnabled) &&
        payload.course.onlineSalesEnabled !== false;
      const receiverLabel =
        payload.paymentReceiverInstitution?.name ||
        payload.course.paymentReceiverName ||
        (payload.course.paymentReceiverType === 'provider'
          ? payload.providerInstitution?.name
          : payload.course.paymentReceiverType === 'platform'
            ? '平台'
            : '');
      const defaultTeachers =
        payload.defaultTeachers && payload.defaultTeachers.length
          ? payload.defaultTeachers
          : payload.defaultTeacher
            ? [payload.defaultTeacher]
            : [];
      const campuses =
        payload.campuses && payload.campuses.length
          ? payload.campuses
          : payload.campus
            ? [payload.campus]
            : [];
      this.setData({
        loading: false,
        course: payload.course,
        businessModel: payload.businessModel,
        providerInstitution: payload.providerInstitution ?? null,
        defaultTeacher: payload.defaultTeacher ?? null,
        paymentReceiverInstitution: payload.paymentReceiverInstitution ?? null,
        onlinePackageSalesAllowed,
        providerLabel: payload.providerInstitution?.name || '平台自有 / 待确认',
        teacherLabel: defaultTeachers.length
          ? defaultTeachers.map((teacher) => teacher.name).join(' / ')
          : '场次确认',
        locationLabel: campusLabel(campuses),
        trialNotice: mergeNotice(payload.course.trialDescription, payload.course.reservationNotice),
        receiverLabel,
        packages: payload.coursePackages.map((item) => ({
          ...item,
          priceLabel: money(packagePriceAmount(item)),
          lessonLabel: packageLessonLabel(item),
          originalPriceLabel:
            item.discountPriceAmount === null || item.discountPriceAmount === undefined
              ? ''
              : money(item.priceAmount),
        })),
        contentBlocks: parseBlocks(payload.course.content),
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  goCourses() {
    wx.switchTab({ url: '/pages/courses/index' });
  },

  onTrialTap() {
    this.setData({
      showTrialForm: true,
      showCheckoutForm: false,
      selectedPackage: null,
      checkoutOrder: null,
      checkoutDefaultPassword: '',
    });
  },

  onBuyTap(event: { currentTarget: { dataset: { id?: string } } }) {
    if (!this.data.onlinePackageSalesAllowed) {
      wx.showToast({ title: '请先预约试听，到店确认正式方案', icon: 'none' });
      return;
    }
    const packageId = event.currentTarget.dataset.id;
    const packages = this.data.packages as PackageItem[];
    const selectedPackage = packages.find((item: PackageItem) => item.id === packageId) ?? null;
    if (!selectedPackage) {
      wx.showToast({ title: '课时包不存在', icon: 'none' });
      return;
    }
    this.setData({
      selectedPackage,
      showCheckoutForm: true,
      showTrialForm: false,
      checkoutOrder: null,
      checkoutDefaultPassword: '',
    });
  },

  closeCheckout() {
    if (this.data.submittingOrder || this.data.payingOrder) return;
    this.setData({
      showCheckoutForm: false,
      selectedPackage: null,
      checkoutOrder: null,
      checkoutDefaultPassword: '',
    });
  },

  closeTrial() {
    if (this.data.submittingTrial) return;
    this.setData({ showTrialForm: false });
  },

  noop() {
    return;
  },

  async onCheckoutSubmit(event: {
    detail: {
      value: {
        guardianName?: string;
        guardianPhone?: string;
        studentName?: string;
        grade?: string;
      };
    };
  }) {
    const selectedPackage = this.data.selectedPackage;
    if (!selectedPackage) return;

    const value = event.detail.value;
    const guardianName = (value.guardianName || '').trim();
    const guardianPhone = (value.guardianPhone || '').trim();
    const studentName = (value.studentName || '').trim();
    const grade = (value.grade || '').trim();

    if (!guardianPhone || !studentName) {
      wx.showToast({ title: '请填写手机号和孩子姓名', icon: 'none' });
      return;
    }

    this.setData({ submittingOrder: true });
    try {
      if (hasToken()) {
        await requestSubscribe(['payment_success']);
      }
      const payload = await createPublicOrder({
        packageId: selectedPackage.id,
        courseId: this.data.course?.id,
        guardianName: guardianName || undefined,
        guardianPhone,
        studentName,
        grade,
        source: 'mini_program',
        medium: 'wechat_mini_program',
      });
      const order: CheckoutOrder = {
        ...payload.order,
        amountLabel: money(payload.order.amount),
        statusLabel: orderStatusLabel(payload.order.status),
      };
      this.setData({
        checkoutOrder: order,
        checkoutDefaultPassword: payload.checkout.defaultPassword || '',
      });
      await this.payCreatedOrder(order.orderNo);
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '下单失败',
        icon: 'none',
      });
    } finally {
      this.setData({ submittingOrder: false });
    }
  },

  async payCreatedOrder(orderNo: string) {
    this.setData({ payingOrder: true });
    try {
      if (hasToken()) {
        try {
          const intent = await createWechatMiniPaymentIntent(orderNo);
          if (intent.nextAction === 'none' && intent.status === 'paid') {
            wx.showToast({ title: '订单已支付', icon: 'success' });
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
          await this.finishPaidOrder(paidOrder);
          return;
        } catch (error) {
          await this.offerMockPayment(orderNo, error instanceof Error ? error.message : '');
          return;
        }
      }

      await this.offerMockPayment(orderNo, '未登录家长中心，暂不能发起小程序微信支付。');
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '支付初始化失败',
        icon: 'none',
      });
    } finally {
      this.setData({ payingOrder: false });
    }
  },

  onContinuePay(event: { currentTarget: { dataset: { orderNo?: string } } }) {
    const orderNo = event.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    this.payCreatedOrder(orderNo);
  },

  async offerMockPayment(orderNo: string, reason?: string) {
    try {
      const intent = await createPaymentIntent(orderNo, 'mock');
      if (!intent.configured || intent.nextAction !== 'mock_pay') {
        wx.showModal({
          title: '支付待配置',
          content: reason || '订单已创建，微信支付配置完成后可继续支付。',
          showCancel: false,
        });
        return;
      }

      wx.showModal({
        title: '开发模拟支付',
        content: reason
          ? `${reason}\n\n当前可使用 mock-pay 完成开发环境验证。`
          : '当前可使用 mock-pay 完成开发环境验证，并给孩子增加课时。',
        confirmText: '模拟支付',
        success: async (result) => {
          if (!result.confirm) return;
          await this.confirmMockPayment(orderNo);
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '支付待配置',
        icon: 'none',
      });
    }
  },

  async finishPaidOrder(paidOrder: ParentOrder) {
    const order: CheckoutOrder = {
      ...paidOrder,
      amountLabel: money(paidOrder.amount),
      statusLabel: orderStatusLabel(paidOrder.status),
    };
    this.setData({ checkoutOrder: order });
    wx.showModal({
      title: '支付成功',
      content: this.data.checkoutDefaultPassword
        ? `课时已到账。手机号账号初始密码：${this.data.checkoutDefaultPassword}`
        : '课时已到账，可到家长中心查看。',
      showCancel: true,
      confirmText: '去查看',
      success: (result) => {
        if (result.confirm) {
          wx.switchTab({ url: '/pages/account/index' });
        }
      },
    });
  },

  async confirmMockPayment(orderNo: string) {
    this.setData({ payingOrder: true });
    try {
      const paidOrder = await mockPayOrder(orderNo);
      await this.finishPaidOrder(paidOrder);
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '支付失败',
        icon: 'none',
      });
    } finally {
      this.setData({ payingOrder: false });
    }
  },

  async onTrialSubmit(event: {
    detail: {
      value: {
        guardianName?: string;
        phone?: string;
        studentName?: string;
        grade?: string;
      };
    };
  }) {
    const course = this.data.course;
    if (!course) return;
    const value = event.detail.value;
    const guardianName = (value.guardianName || '').trim();
    const phone = (value.phone || '').trim();
    const studentName = (value.studentName || '').trim();
    const grade = (value.grade || '').trim();

    if (!guardianName || !phone || !studentName || !grade) {
      wx.showToast({ title: '请补全报名信息', icon: 'none' });
      return;
    }

    this.setData({ submittingTrial: true });
    try {
      await requestSubscribe(['trial_registration']);
      await submitTrialRegistration({
        guardianName,
        phone,
        studentName,
        grade,
        courseId: course.id,
        source: 'mini_program',
        course: course.slug,
        medium: 'wechat_mini_program',
      });
      wx.showModal({
        title: '提交成功',
        content: '老师会尽快联系确认试听时间。',
        showCancel: false,
        success: () => {
          this.setData({ showTrialForm: false });
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      });
    } finally {
      this.setData({ submittingTrial: false });
    }
  },
});
