import {
  createPaymentIntent,
  createPublicOrder,
  fetchCourse,
  mockPayOrder,
  submitTrialRegistration,
  type Course,
  type CoursePackage,
  type ParentOrder,
} from '../../services/api';
import { money } from '../../utils/format';
import { parseBlocks, type Block } from '../../utils/blocks';

type PackageItem = CoursePackage & { priceLabel: string };
type CheckoutOrder = ParentOrder & { amountLabel: string; statusLabel: string };

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待支付',
    paid: '已支付',
    cancelled: '已取消',
    refunded: '已退款',
  };
  return labels[status] || status;
}

Page({
  data: {
    loading: true,
    notFound: false,
    course: null as Course | null,
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

  async load(slug: string) {
    if (!slug) {
      this.setData({ loading: false, notFound: true });
      return;
    }

    this.setData({ loading: true, notFound: false });
    try {
      const payload = await fetchCourse(slug);
      wx.setNavigationBarTitle({ title: payload.course.name });
      this.setData({
        loading: false,
        course: payload.course,
        packages: payload.coursePackages.map((item) => ({ ...item, priceLabel: money(item.priceAmount) })),
        contentBlocks: parseBlocks(payload.course.content),
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  goCourses() {
    wx.navigateTo({ url: '/pages/courses/index' });
  },

  onTrialTap() {
    this.setData({ showTrialForm: true });
  },

  onBuyTap(event: { currentTarget: { dataset: { id?: string } } }) {
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
    this.setData({
      showCheckoutForm: false,
      selectedPackage: null,
      checkoutOrder: null,
      checkoutDefaultPassword: '',
    });
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
      const payload = await createPublicOrder({
        packageId: selectedPackage.id,
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
      const intent = await createPaymentIntent(orderNo, 'mock');
      if (!intent.configured || intent.nextAction !== 'mock_pay') {
        wx.showModal({
          title: '支付待配置',
          content: '订单已创建，微信支付配置完成后可继续支付。',
          showCancel: false,
        });
        return;
      }

      wx.showModal({
        title: '模拟支付',
        content: '开发环境将使用 mock-pay 完成支付并给孩子增加课时。',
        confirmText: '确认支付',
        success: async (result) => {
          if (!result.confirm) return;
          await this.confirmMockPayment(orderNo);
        },
      });
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

  async confirmMockPayment(orderNo: string) {
    this.setData({ payingOrder: true });
    try {
      const paidOrder = await mockPayOrder(orderNo);
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
            wx.navigateTo({ url: '/pages/account/index' });
          }
        },
      });
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
