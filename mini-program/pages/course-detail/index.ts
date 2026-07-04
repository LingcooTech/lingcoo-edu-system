import {
  createPaymentIntent,
  completePackageOrderStudent,
  createPublicOrder,
  createWechatMiniPaymentIntent,
  fetchCourse,
  hasToken,
  mockPayOrder,
  submitTrialRegistration,
  syncOrderPayment,
  setToken,
  type Course,
  type CoursePackage,
  type BusinessModelSettings,
  type PublicCampus,
  type PublicInstitution,
  type PublicTeacher,
  type ParentOrder,
  type PaymentIntent,
  type StudentWork,
} from '../../services/api';
import { money } from '../../utils/format';
import { toUserFacingMessage } from '../../utils/user-facing-message';
import { parseBlocks, type Block } from '../../utils/blocks';
import { requestSubscribe } from '../../services/subscribe';

type PackageItem = CoursePackage & {
  priceLabel: string;
  lessonLabel: string;
  originalPriceLabel: string;
};
type WorkItem = StudentWork & {
  coverUrl: string;
  courseName: string;
  className: string;
};
type CheckoutOrder = ParentOrder & { amountLabel: string; statusLabel: string };
type PhoneWx = typeof wx & {
  makePhoneCall(options: { phoneNumber: string; fail?: () => void }): void;
};
type SheetTouchEvent = {
  changedTouches: Array<{ clientY: number }>;
};

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

function loginWechatMini(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (result) => {
        if (result.code) {
          resolve(result.code);
          return;
        }
        reject(new Error('登录失败，请稍后重试'));
      },
      fail: (error) => reject(new Error(toUserFacingMessage(error.errMsg, '登录失败，请稍后重试'))),
    });
  });
}

import { enableShareMenu, shareCard, timelineCard } from '../../utils/share';

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
    contactPhone: '',
    packages: [] as PackageItem[],
    studentWorks: [] as WorkItem[],
    contentBlocks: [] as Block[],
    showTrialForm: false,
    submittingTrial: false,
    trialSheetDragging: false,
    trialSheetDragStartY: 0,
    trialSheetOffset: 0,
    showCheckoutForm: false,
    checkoutSheetDragging: false,
    checkoutSheetDragStartY: 0,
    checkoutSheetOffset: 0,
    submittingOrder: false,
    payingOrder: false,
    selectedPackage: null as PackageItem | null,
    checkoutOrder: null as CheckoutOrder | null,
    checkoutDefaultPassword: '',
    childProfileRequired: false,
    completingChildProfile: false,
  },

  onLoad(options: { slug?: string }) {
    enableShareMenu();
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
        providerLabel: payload.providerInstitution?.name || '合作机构待确认',
        teacherLabel: defaultTeachers.length
          ? defaultTeachers.map((teacher) => teacher.name).join(' / ')
          : '场次确认',
        locationLabel: campusLabel(campuses),
        trialNotice: mergeNotice(payload.course.trialDescription, payload.course.reservationNotice),
        receiverLabel,
        contactPhone: extractPhone(
          payload.providerInstitution?.contact || payload.paymentReceiverInstitution?.contact,
        ),
        packages: payload.coursePackages.map((item) => ({
          ...item,
          priceLabel: money(packagePriceAmount(item)),
          lessonLabel: packageLessonLabel(item),
          originalPriceLabel:
            item.discountPriceAmount === null || item.discountPriceAmount === undefined
              ? ''
              : money(item.priceAmount),
        })),
        studentWorks: (payload.studentWorks || []).map((item) => ({
          ...item,
          coverUrl: item.imageUrls[0] || '',
          courseName: item.course?.name || payload.course.name,
          className: item.class?.name || '',
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
      trialSheetDragging: false,
      trialSheetDragStartY: 0,
      trialSheetOffset: 0,
      showCheckoutForm: false,
      selectedPackage: null,
      checkoutOrder: null,
      checkoutDefaultPassword: '',
      childProfileRequired: false,
      completingChildProfile: false,
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

  onBuyTap(event: { currentTarget: { dataset: { id?: string } } }) {
    if (!this.data.onlinePackageSalesAllowed) {
      wx.showToast({ title: '请先预约试听，到店确认常规方案', icon: 'none' });
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
      checkoutSheetDragging: false,
      checkoutSheetDragStartY: 0,
      checkoutSheetOffset: 0,
      checkoutOrder: null,
      checkoutDefaultPassword: '',
      childProfileRequired: false,
      completingChildProfile: false,
    });
  },

  onPreviewWork(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },

  closeCheckout() {
    if (this.data.submittingOrder || this.data.payingOrder) return;
    if (this.data.childProfileRequired) {
      wx.showToast({ title: '请先完善孩子信息以开通服务', icon: 'none' });
      return;
    }
    this.setData({
      showCheckoutForm: false,
      checkoutSheetDragging: false,
      checkoutSheetDragStartY: 0,
      checkoutSheetOffset: 0,
      selectedPackage: null,
      checkoutOrder: null,
      checkoutDefaultPassword: '',
      childProfileRequired: false,
      completingChildProfile: false,
    });
  },

  closeTrial() {
    if (this.data.submittingTrial) return;
    this.setData({
      showTrialForm: false,
      trialSheetDragging: false,
      trialSheetDragStartY: 0,
      trialSheetOffset: 0,
    });
  },

  noop() {
    return;
  },

  onCheckoutSheetTouchStart(event: SheetTouchEvent) {
    if (this.data.submittingOrder || this.data.payingOrder || this.data.childProfileRequired) {
      return;
    }
    const touch = event.changedTouches[0];
    this.setData({
      checkoutSheetDragging: true,
      checkoutSheetDragStartY: touch ? touch.clientY : 0,
      checkoutSheetOffset: 0,
    });
  },

  onCheckoutSheetTouchMove(event: SheetTouchEvent) {
    if (!this.data.checkoutSheetDragging || this.data.submittingOrder || this.data.payingOrder) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) return;
    const offset = Math.max(0, touch.clientY - this.data.checkoutSheetDragStartY);
    this.setData({ checkoutSheetOffset: Math.min(offset, 260) });
  },

  onCheckoutSheetTouchEnd() {
    if (!this.data.checkoutSheetDragging) return;
    if (this.data.checkoutSheetOffset >= 72) {
      this.closeCheckout();
      return;
    }
    this.setData({
      checkoutSheetDragging: false,
      checkoutSheetDragStartY: 0,
      checkoutSheetOffset: 0,
    });
  },

  onTrialSheetTouchStart(event: SheetTouchEvent) {
    if (this.data.submittingTrial) return;
    const touch = event.changedTouches[0];
    this.setData({
      trialSheetDragging: true,
      trialSheetDragStartY: touch ? touch.clientY : 0,
      trialSheetOffset: 0,
    });
  },

  onTrialSheetTouchMove(event: SheetTouchEvent) {
    if (!this.data.trialSheetDragging || this.data.submittingTrial) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const offset = Math.max(0, touch.clientY - this.data.trialSheetDragStartY);
    this.setData({ trialSheetOffset: Math.min(offset, 260) });
  },

  onTrialSheetTouchEnd() {
    if (!this.data.trialSheetDragging) return;
    if (this.data.trialSheetOffset >= 72) {
      this.closeTrial();
      return;
    }
    this.setData({
      trialSheetDragging: false,
      trialSheetDragStartY: 0,
      trialSheetOffset: 0,
    });
  },

  async onCheckoutPhoneAuth(event: { detail: { code?: string; errMsg?: string } }) {
    const selectedPackage = this.data.selectedPackage;
    if (!selectedPackage) return;
    const phoneCode = event.detail.code;
    if (!phoneCode) {
      wx.showToast({ title: '需要授权手机号后继续支付', icon: 'none' });
      return;
    }

    this.setData({ submittingOrder: true });
    try {
      const wechatMiniCode = await loginWechatMini();
      const payload = await createPublicOrder({
        packageId: selectedPackage.id,
        courseId: this.data.course?.id,
        phoneCode,
        source: 'mini_program',
        medium: 'wechat_mini_program',
        wechatMiniCode,
      });
      if (payload.checkout.authToken) {
        setToken(payload.checkout.authToken);
      }
      if (hasToken()) {
        await requestSubscribe(['payment_success']);
      }
      const order: CheckoutOrder = {
        ...payload.order,
        amountLabel: money(payload.order.amount),
        statusLabel: orderStatusLabel(payload.order.status),
      };
      this.setData({
        checkoutOrder: order,
        checkoutDefaultPassword: payload.checkout.defaultPassword || '',
        childProfileRequired: false,
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

  async onCompleteCheckoutStudent(event: {
    detail: { value: { studentName?: string; grade?: string } };
  }) {
    const order = this.data.checkoutOrder;
    if (!order) return;
    const studentName = (event.detail.value.studentName || '').trim();
    const grade = (event.detail.value.grade || '').trim();
    if (!studentName) {
      wx.showToast({ title: '请填写孩子姓名', icon: 'none' });
      return;
    }
    this.setData({ completingChildProfile: true });
    try {
      const payload = await completePackageOrderStudent(order.orderNo, { studentName, grade });
      const nextOrder: CheckoutOrder = {
        ...payload.order,
        amountLabel: money(payload.order.amount),
        statusLabel: orderStatusLabel(payload.order.status),
      };
      this.setData({ checkoutOrder: nextOrder, childProfileRequired: false });
      wx.showModal({
        title: '已开通服务',
        content: '孩子信息已完善，课时已到账，可在家长中心查看。',
        showCancel: false,
        success: () => wx.switchTab({ url: '/pages/account/index' }),
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      });
    } finally {
      this.setData({ completingChildProfile: false });
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
            throw new Error('支付参数未就绪');
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

      await this.offerMockPayment(orderNo, '未登录家长中心，暂不能发起小程序支付。');
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
          content: reason || '订单已创建，支付配置完成后可继续支付。',
          showCancel: false,
        });
        return;
      }

      wx.showModal({
        title: '开发模拟支付',
        content: reason
          ? `${reason}\n\n当前可使用模拟支付完成开发环境验证。`
          : '当前可使用模拟支付完成开发环境验证，并给孩子增加课时。',
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
    if (!paidOrder.studentId && paidOrder.orderType === 'package_purchase') {
      this.setData({ checkoutOrder: order, childProfileRequired: true });
      wx.showToast({ title: '支付成功，请完善孩子信息', icon: 'success' });
      return;
    }

    this.setData({ checkoutOrder: order, childProfileRequired: false });
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
        content: '工作人员会尽快联系确认试听时间。',
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
