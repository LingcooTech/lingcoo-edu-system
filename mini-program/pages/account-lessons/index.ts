import {
  createPaymentIntent,
  createPublicOrder,
  createWechatMiniPaymentIntent,
  fetchCourse,
  fetchParentAttendance,
  fetchParentCalendar,
  fetchParentLessonAccounts,
  hasToken,
  mockPayOrder,
  setToken,
  syncOrderPayment,
  type CoursePackage,
  type ParentOrder,
  type PaymentIntent,
} from '../../services/api';
import { requestSubscribe } from '../../services/subscribe';
import {
  toAttendanceItem,
  toCalendarEventItem,
  toLessonAccountItem,
  type AttendanceItem,
  type CalendarEventItem,
  type LessonAccountItem,
} from '../../utils/parent-center';
import { money } from '../../utils/format';
import { toUserFacingMessage } from '../../utils/user-facing-message';

type RenewalAction = {
  key: string;
  studentId: string;
  courseId: string;
  packageId: string;
  packageName: string;
  packageLessonLabel: string;
  packagePriceLabel: string;
};

type LessonAccountCard = LessonAccountItem & {
  balanceLabel: string;
  periodLabel: string;
  renewal: RenewalAction | null;
  upcoming: CalendarEventItem[];
  attendance: AttendanceItem[];
  upcomingCount: number;
  consumedCount: number;
  activeRecordTab: 'upcoming' | 'attendance';
};

type RenewalPhoneAuthEvent = {
  currentTarget: { dataset: { key?: string } };
  detail: { code?: string; errMsg?: string };
};

type StudentFilter = {
  id: string;
  label: string;
};

type LessonAccountGroup = {
  studentId: string;
  studentName: string;
  accounts: LessonAccountCard[];
};

function packagePriceAmount(pkg: CoursePackage): number {
  return pkg.discountPriceAmount ?? pkg.priceAmount;
}

function packageLessonLabel(pkg: CoursePackage): string {
  return pkg.giftedLessonCount
    ? `${pkg.lessonCount} 课时 + 赠 ${pkg.giftedLessonCount} 课时`
    : `${pkg.lessonCount} 课时`;
}

function pickRenewalPackage(packages: CoursePackage[]): CoursePackage | null {
  if (!packages.length) return null;
  return [...packages].sort((a, b) => {
    const aLessons = a.lessonCount + a.giftedLessonCount;
    const bLessons = b.lessonCount + b.giftedLessonCount;
    if (aLessons !== bLessons) return aLessons - bLessons;
    return packagePriceAmount(a) - packagePriceAmount(b);
  })[0];
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

function loginWechatMiniCode(): Promise<string> {
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

function nextNinetyDays() {
  const from = new Date();
  const to = new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function uniqueStudentFilters(accounts: LessonAccountCard[]): StudentFilter[] {
  const filters: StudentFilter[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    if (seen.has(account.studentId)) continue;
    seen.add(account.studentId);
    filters.push({
      id: account.studentId,
      label: account.studentName,
    });
  }
  return filters;
}

function buildAccountGroups(
  accounts: LessonAccountCard[],
  selectedStudentId: string,
): LessonAccountGroup[] {
  const filtered =
    selectedStudentId && selectedStudentId !== 'all'
      ? accounts.filter((account) => account.studentId === selectedStudentId)
      : accounts;
  const groups: LessonAccountGroup[] = [];
  const groupIndex = new Map<string, number>();

  for (const account of filtered) {
    const index = groupIndex.get(account.studentId);
    if (index === undefined) {
      groupIndex.set(account.studentId, groups.length);
      groups.push({
        studentId: account.studentId,
        studentName: account.studentName,
        accounts: [account],
      });
      continue;
    }
    groups[index].accounts.push(account);
  }
  return groups;
}

Page({
  data: {
    loading: true,
    needLogin: false,
    payingKey: '',
    dismissedRenewalKeys: [] as string[],
    selectedStudentId: 'all',
    showStudentFilter: false,
    studentFilters: [] as StudentFilter[],
    accounts: [] as LessonAccountCard[],
    accountGroups: [] as LessonAccountGroup[],
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  goLogin() {
    wx.switchTab({ url: '/pages/account/index' });
  },

  async load() {
    if (!hasToken()) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const [lessonAccounts, attendance, calendar] = await Promise.all([
        fetchParentLessonAccounts(),
        fetchParentAttendance(),
        fetchParentCalendar(nextNinetyDays()),
      ]);
      const lessonItems = lessonAccounts.map(toLessonAccountItem);
      const attendanceItems = attendance.map(toAttendanceItem);
      const calendarItems = calendar.map(toCalendarEventItem);
      const now = Date.now();
      const renewals = await this.buildRenewals(lessonItems);
      const dismissed = new Set(this.data.dismissedRenewalKeys as string[]);
      const accounts = lessonItems.map((item) => {
        const accountAttendance = attendanceItems.filter(
          (record) => record.studentId === item.studentId && record.courseId === item.courseId,
        );
        const upcoming = calendarItems.filter(
          (event) =>
            event.student.id === item.studentId &&
            event.course?.id === item.courseId &&
            new Date(event.startsAt).getTime() >= now,
        );
        const renewal = renewals.get(item.id) ?? null;
        return {
          ...item,
          balanceLabel: item.periodPackage
            ? `${item.periodPackage.periodUnit === 'week' ? '周卡' : '月卡'} ${item.balance}/${
                item.periodPackage.lessonCount
              }`
            : `${item.balance} 课时`,
          periodLabel: item.periodPackage?.endsAt
            ? `有效期至 ${new Date(item.periodPackage.endsAt).toLocaleDateString('zh-CN')}`
            : '',
          renewal: renewal && !dismissed.has(renewal.key) ? renewal : null,
          upcoming,
          attendance: accountAttendance,
          upcomingCount: upcoming.length,
          consumedCount: accountAttendance.filter((record) => record.lessonDelta < 0).length,
          activeRecordTab: 'upcoming' as const,
        };
      });
      const studentFilters = uniqueStudentFilters(accounts);
      const availableStudentIds = new Set(studentFilters.map((student) => student.id));
      const currentSelected = this.data.selectedStudentId as string;
      const selectedStudentId =
        currentSelected === 'all' || availableStudentIds.has(currentSelected)
          ? currentSelected
          : 'all';
      this.setData({
        accounts,
        accountGroups: buildAccountGroups(accounts, selectedStudentId),
        studentFilters,
        selectedStudentId,
        showStudentFilter: studentFilters.length > 1,
        needLogin: false,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  async buildRenewals(lessonItems: LessonAccountItem[]): Promise<Map<string, RenewalAction>> {
    const lowBalanceItems = lessonItems.filter(
      (item) => !item.periodPackage && item.balance <= 3 && item.balance >= 0 && item.course?.slug,
    );
    const renewals = new Map<string, RenewalAction>();
    if (!lowBalanceItems.length) return renewals;

    const detailBySlug = new Map<string, Awaited<ReturnType<typeof fetchCourse>> | null>();
    await Promise.all(
      Array.from(new Set(lowBalanceItems.map((item) => item.course!.slug as string))).map(
        async (slug) => {
          try {
            detailBySlug.set(slug, await fetchCourse(slug));
          } catch {
            detailBySlug.set(slug, null);
          }
        },
      ),
    );

    for (const item of lowBalanceItems) {
      const detail = detailBySlug.get(item.course!.slug as string);
      if (
        !detail ||
        !detail.businessModel.onlinePackageSalesEnabled ||
        detail.course.onlineSalesEnabled === false
      ) {
        continue;
      }
      const selectedPackage = pickRenewalPackage(detail.coursePackages);
      if (!selectedPackage) continue;
      renewals.set(item.id, {
        key: item.id,
        studentId: item.studentId,
        courseId: item.courseId,
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        packageLessonLabel: packageLessonLabel(selectedPackage),
        packagePriceLabel: money(packagePriceAmount(selectedPackage)),
      });
    }
    return renewals;
  },

  onDismissRenewal(event: { currentTarget: { dataset: { key?: string } } }) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    const dismissedRenewalKeys = Array.from(
      new Set([...(this.data.dismissedRenewalKeys as string[]), key]),
    );
    const accounts = (this.data.accounts as LessonAccountCard[]).map((account) =>
      account.renewal?.key === key ? { ...account, renewal: null } : account,
    );
    this.setData({
      dismissedRenewalKeys,
      accounts,
      accountGroups: buildAccountGroups(accounts, this.data.selectedStudentId as string),
    });
  },

  onSelectStudent(event: { currentTarget: { dataset: { id?: string } } }) {
    const selectedStudentId = event.currentTarget.dataset.id || 'all';
    this.setData({
      selectedStudentId,
      accountGroups: buildAccountGroups(
        this.data.accounts as LessonAccountCard[],
        selectedStudentId,
      ),
    });
  },

  onRecordTabChange(event: {
    currentTarget: { dataset: { id?: string; tab?: 'upcoming' | 'attendance' } };
  }) {
    const id = event.currentTarget.dataset.id;
    const tab = event.currentTarget.dataset.tab;
    if (!id || !tab) return;
    const accounts = (this.data.accounts as LessonAccountCard[]).map((account) =>
      account.id === id ? { ...account, activeRecordTab: tab } : account,
    );
    this.setData({
      accounts,
      accountGroups: buildAccountGroups(accounts, this.data.selectedStudentId as string),
    });
  },

  async onRenewalPhoneAuth(event: RenewalPhoneAuthEvent) {
    const key = event.currentTarget.dataset.key;
    const phoneCode = event.detail.code;
    if (!key) return;
    if (!phoneCode) {
      wx.showToast({
        title: toUserFacingMessage(event.detail.errMsg, '请授权手机号后续费'),
        icon: 'none',
      });
      return;
    }
    if (this.data.payingKey) return;

    const account = (this.data.accounts as LessonAccountCard[]).find(
      (item) => item.renewal?.key === key,
    );
    const renewal = account?.renewal;
    if (!account || !renewal) {
      wx.showToast({ title: '续费信息已变化，请刷新后再试', icon: 'none' });
      return;
    }

    this.setData({ payingKey: key });
    try {
      const wechatMiniCode = await loginWechatMiniCode();
      const payload = await createPublicOrder({
        packageId: renewal.packageId,
        courseId: renewal.courseId,
        studentId: renewal.studentId,
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
      await this.payRenewalOrder(payload.order.orderNo);
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '续费失败',
        icon: 'none',
      });
    } finally {
      this.setData({ payingKey: '' });
    }
  },

  async payRenewalOrder(orderNo: string) {
    if (hasToken()) {
      try {
        const intent = await createWechatMiniPaymentIntent(orderNo);
        if (intent.nextAction === 'none' && intent.status === 'paid') {
          await this.finishRenewalPayment(orderNo);
          return;
        }
        if (intent.nextAction !== 'request_payment') {
          throw new Error('支付参数未就绪');
        }

        await requestWechatPayment(intent);
        const paidOrder = await syncOrderPayment(orderNo);
        if (paidOrder.status !== 'paid') {
          throw new Error('支付结果同步中，请稍后查看课时数');
        }
        await this.finishRenewalPayment(orderNo, paidOrder);
        return;
      } catch (error) {
        await this.offerRenewalMockPayment(orderNo, error instanceof Error ? error.message : '');
        return;
      }
    }

    await this.offerRenewalMockPayment(orderNo, '未登录成长中心，暂不能发起小程序支付。');
  },

  async offerRenewalMockPayment(orderNo: string, reason?: string) {
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
          ? `${reason}\n\n当前可使用模拟支付完成续费流程验证。`
          : '当前可使用模拟支付完成续费流程验证。',
        confirmText: '模拟支付',
        success: async (result) => {
          if (!result.confirm) return;
          const paidOrder = await mockPayOrder(orderNo);
          await this.finishRenewalPayment(orderNo, paidOrder);
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '支付待配置',
        icon: 'none',
      });
    }
  },

  async finishRenewalPayment(orderNo: string, paidOrder?: ParentOrder) {
    if (!paidOrder) {
      paidOrder = await syncOrderPayment(orderNo);
    }
    if (paidOrder.status !== 'paid') {
      wx.showToast({ title: '支付结果同步中，请稍后查看', icon: 'none' });
      return;
    }
    await this.load();
    wx.showModal({
      title: '续费成功',
      content: '课时已到账，可查看课时明细。',
      showCancel: false,
    });
  },
});
