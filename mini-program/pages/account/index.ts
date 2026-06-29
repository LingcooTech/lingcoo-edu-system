import {
  bindWechatMiniPhone,
  clearToken,
  fetchMe,
  fetchParentCalendar,
  fetchParentChildren,
  fetchParentCheckInSessions,
  fetchParentHomeworkCheckIns,
  fetchParentLessonAccounts,
  fetchParentLessonFeedbacks,
  fetchParentNotifications,
  fetchParentOrders,
  fetchParentSeatReservations,
  hasToken,
  logout,
  setToken,
  wechatMiniLogin,
  type AuthAccount,
} from '../../services/api';
import {
  toCalendarEventItem,
  toLessonAccountItem,
  toLessonFeedbackItem,
  type CalendarEventItem,
  type LessonAccountItem,
  type LessonFeedbackItem,
} from '../../utils/parent-center';
import { GUEST_ACCOUNT_ICONS } from '../../utils/icons';

type HubStats = {
  childCount: number;
  totalBalance: number;
  pendingCheckIns: number;
  pendingTasks: number;
  unreadNotifications: number;
};

function emptyStats(): HubStats {
  return {
    childCount: 0,
    totalBalance: 0,
    pendingCheckIns: 0,
    pendingTasks: 0,
    unreadNotifications: 0,
  };
}

type ChildSummary = {
  id: string;
  name: string;
  meta: string;
  balance: number;
};

type TodoItem = {
  key: string;
  label: string;
  value: number;
  url: string;
};

type QuickEntry = {
  key: string;
  symbol: string;
  label: string;
  group: string;
  url: string;
  badge: number;
};

type QuickGroup = {
  title: string;
  entries: QuickEntry[];
};

type PhoneAuthEvent = { detail: { code?: string; errMsg?: string } };

function nextThirtyDays() {
  const from = new Date();
  const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const ENTRIES = [
  {
    key: 'schedule',
    symbol: '表',
    label: '课程表',
    group: '课前准备',
    url: '/pages/account-attendance/index',
  },
  {
    key: 'students',
    symbol: '孩',
    label: '学员档案',
    group: '课前准备',
    url: '/pages/account-students/index',
  },
  {
    key: 'trials',
    symbol: '试',
    label: '试听席位',
    group: '课前准备',
    url: '/pages/account-trials/index',
  },
  {
    key: 'feedbacks',
    symbol: '评',
    label: '课后点评',
    group: '课后服务',
    url: '/pages/account-feedbacks/index',
  },
  {
    key: 'homework',
    symbol: '作',
    label: '作业打卡',
    group: '课后服务',
    url: '/pages/account-homework/index',
  },
  {
    key: 'notifications',
    symbol: '信',
    label: '通知消息',
    group: '课后服务',
    url: '/pages/account-notifications/index',
  },
  {
    key: 'orders',
    symbol: '单',
    label: '订单记录',
    group: '个人中心',
    url: '/pages/account-orders/index',
  },
] satisfies Array<Omit<QuickEntry, 'badge'>>;

const ACCOUNT_TAB_INDEX = 4;

function withBadges(entries: Array<Omit<QuickEntry, 'badge'>>, counts: Record<string, number>) {
  return entries.map((entry) => ({ ...entry, badge: counts[entry.key] ?? 0 }));
}

function groupEntries(entries: QuickEntry[]): QuickGroup[] {
  const titles = ['课前准备', '课后服务', '个人中心'];
  return titles
    .map((title) => ({
      title,
      entries: entries.filter((entry) => entry.group === title),
    }))
    .filter((group) => group.entries.length > 0);
}

Page({
  data: {
    navSolid: false,
    loading: false,
    binding: false,
    refreshing: false,
    booting: false,
    bindToken: '',
    loginSheetVisible: false,
    account: null as AuthAccount | null,
    defaultPassword: '',
    avatarText: '我',
    guestIcons: GUEST_ACCOUNT_ICONS,
    entryGroups: groupEntries(withBadges(ENTRIES, {})) as QuickGroup[],
    stats: emptyStats(),
    childSummaries: [] as ChildSummary[],
    nextLesson: null as CalendarEventItem | null,
    latestFeedback: null as LessonFeedbackItem | null,
    todoItems: [] as TodoItem[],
  },

  onShow() {
    if (hasToken()) {
      this.setData({ booting: !this.data.account });
      this.loadSession();
    } else {
      this.updateTabBadge(0);
    }
  },

  onPullDownRefresh() {
    if (hasToken()) {
      if (this.data.account?.role === 'teacher') {
        const panel = this.selectComponent('#teacherWorkbench') as
          | { refresh?: () => Promise<void> }
          | null;
        Promise.resolve(panel?.refresh?.()).finally(() => wx.stopPullDownRefresh());
        return;
      }
      this.loadSummary().finally(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
    }
  },

  onPageScroll(event: { scrollTop: number }) {
    const navSolid = event.scrollTop > 24;
    if (navSolid !== this.data.navSolid) {
      this.setData({ navSolid });
    }
  },

  async loadSession() {
    this.setData({ refreshing: true });
    try {
      const payload = await fetchMe();
      if (!payload.account) {
        clearToken();
        this.resetAccountState();
        return;
      }
      if (payload.account.role === 'teacher') {
        this.applyAccount(payload.account);
        this.updateTabBadge(0);
        return;
      }
      if (payload.account.role !== 'parent') {
        clearToken();
        this.resetAccountState();
        return;
      }
      this.applyAccount(payload.account);
      await this.loadSummary();
    } catch {
      clearToken();
      this.resetAccountState();
    } finally {
      this.setData({ refreshing: false, booting: false });
    }
  },

  applyAccount(account: AuthAccount) {
    const source = account.displayName || account.phone || '我';
    this.setData({
      account,
      bindToken: '',
      avatarText: source.slice(0, 1).toUpperCase(),
    });
  },

  async loadSummary() {
    if (!this.data.account) return;
    try {
      const [
        children,
        lessonAccounts,
        orders,
        notifications,
        checkInSessions,
        seatReservations,
        homeworkCheckIns,
        lessonFeedbacks,
        calendarEvents,
      ] = await Promise.all([
        fetchParentChildren(),
        fetchParentLessonAccounts(),
        fetchParentOrders(),
        fetchParentNotifications(),
        fetchParentCheckInSessions(),
        fetchParentSeatReservations(),
        fetchParentHomeworkCheckIns(),
        fetchParentLessonFeedbacks(),
        fetchParentCalendar(nextThirtyDays()),
      ]);
      const lessonItems = lessonAccounts.map(toLessonAccountItem);
      const lessonItemsByStudentId = new Map<string, LessonAccountItem[]>();
      for (const item of lessonItems) {
        lessonItemsByStudentId.set(item.studentId, [
          ...(lessonItemsByStudentId.get(item.studentId) ?? []),
          item,
        ]);
      }
      const childSummaries = children.slice(0, 3).map((child) => {
        const childLessonItems = lessonItemsByStudentId.get(child.id) ?? [];
        return {
          id: child.id,
          name: child.name,
          meta: [child.grade, child.school].filter(Boolean).join(' · ') || '学员',
          balance: childLessonItems.reduce((sum, item) => sum + item.balance, 0),
        };
      });
      const pendingOrders = orders.filter((item) => item.status === 'pending').length;
      const pendingReservations = seatReservations.filter(
        (item) =>
          item.paymentStatus === 'unpaid' ||
          item.paymentStatus === 'pending' ||
          item.reservationStatus === 'pending_payment',
      ).length;
      const pendingCheckIns = checkInSessions.filter((item) => item.canCheckIn).length;
      const unreadNotifications = notifications.filter((item) => item.status === 'unread').length;
      const latestFeedback = lessonFeedbacks.length
        ? toLessonFeedbackItem(lessonFeedbacks[0])
        : null;
      const upcomingLessons = calendarEvents
        .map(toCalendarEventItem)
        .filter((event) => new Date(event.endsAt).getTime() >= Date.now())
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      const pendingTasks = pendingCheckIns + pendingOrders + pendingReservations;
      this.setData({
        stats: {
          childCount: children.length,
          totalBalance: lessonAccounts.reduce((sum, item) => sum + item.balance, 0),
          pendingCheckIns,
          pendingTasks,
          unreadNotifications,
        },
        childSummaries,
        nextLesson: upcomingLessons[0] ?? null,
        latestFeedback,
        todoItems: [
          {
            key: 'checkins',
            label: '待签到课程',
            value: pendingCheckIns,
            url: '/pages/account-attendance/index',
          },
          {
            key: 'homework',
            label: '作业记录',
            value: homeworkCheckIns.length,
            url: '/pages/account-homework/index',
          },
          {
            key: 'orders',
            label: '待付款 / 待处理',
            value: pendingOrders + pendingReservations,
            url: '/pages/account-orders/index',
          },
        ],
        entryGroups: groupEntries(
          withBadges(ENTRIES, {
            schedule: pendingCheckIns,
            orders: pendingOrders,
            trials: pendingReservations,
            notifications: unreadNotifications,
          }),
        ),
      });
      this.updateTabBadge(unreadNotifications);
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '家长中心加载失败',
        icon: 'none',
      });
    }
  },

  resetAccountState() {
    this.setData({
      account: null,
      bindToken: '',
      loginSheetVisible: false,
      defaultPassword: '',
      avatarText: '我',
      stats: emptyStats(),
      childSummaries: [],
      nextLesson: null,
      latestFeedback: null,
      todoItems: [],
      entryGroups: groupEntries(withBadges(ENTRIES, {})),
    });
    this.updateTabBadge(0);
  },

  updateTabBadge(unreadCount: number) {
    if (unreadCount > 0) {
      wx.setTabBarBadge?.({
        index: ACCOUNT_TAB_INDEX,
        text: unreadCount > 99 ? '99+' : String(unreadCount),
        fail: () => undefined,
      });
      return;
    }

    wx.removeTabBarBadge?.({
      index: ACCOUNT_TAB_INDEX,
      fail: () => undefined,
    });
  },

  async completeLogin(phoneCode?: string) {
    if (this.data.loading || this.data.binding) return;
    this.setData({ loading: true });
    wx.login({
      success: async (result) => {
        try {
          const payload = await wechatMiniLogin(result.code);
          if (payload.bound) {
            setToken(payload.token);
            if (payload.account.role === 'teacher') {
              this.applyAccount(payload.account);
              this.setData({ defaultPassword: '', bindToken: '', loginSheetVisible: false });
              this.updateTabBadge(0);
              wx.showToast({ title: '登录成功', icon: 'success' });
              return;
            }
            this.applyAccount(payload.account);
            this.setData({ defaultPassword: '', bindToken: '', loginSheetVisible: false });
            await this.loadSummary();
            wx.showToast({ title: '登录成功', icon: 'success' });
            return;
          }

          clearToken();
          if (phoneCode) {
            await this.bindPhoneWithToken(payload.bindToken, { phoneCode });
            return;
          }
          this.resetAccountState();
          this.setData({ bindToken: payload.bindToken, loginSheetVisible: true });
          wx.showToast({ title: '请授权手机号完成登录', icon: 'none' });
        } catch (error) {
          wx.showToast({
            title: error instanceof Error ? error.message : '登录失败',
            icon: 'none',
          });
        } finally {
          this.setData({ loading: false });
        }
      },
      fail: (error) => {
        this.setData({ loading: false });
        wx.showToast({ title: error.errMsg || '登录失败', icon: 'none' });
      },
      });
  },

  onWechatLogin(event?: PhoneAuthEvent) {
    const phoneCode = event?.detail?.code;
    if (event?.detail?.errMsg && !phoneCode) {
      wx.showToast({ title: '将尝试使用已绑定微信登录', icon: 'none' });
    }
    this.completeLogin(phoneCode);
  },

  openLoginSheet() {
    this.setData({ loginSheetVisible: true });
  },

  closeLoginSheet() {
    if (this.data.loading || this.data.binding) return;
    this.setData({ loginSheetVisible: false });
  },

  noop() {
    return;
  },

  async bindPhoneWithToken(
    bindToken: string,
    input: { phoneCode?: string; displayName?: string },
  ) {
    if (!bindToken) {
      wx.showToast({ title: '请先微信登录', icon: 'none' });
      return;
    }

    this.setData({ binding: true });
    try {
      const payload = await bindWechatMiniPhone({ bindToken, ...input });
      setToken(payload.token);
      this.applyAccount(payload.account);
      this.setData({
        defaultPassword: payload.account.role === 'parent' ? payload.defaultPassword || '' : '',
        loginSheetVisible: false,
      });
      if (payload.account.role === 'teacher') {
        this.updateTabBadge(0);
        wx.showToast({ title: '绑定成功', icon: 'success' });
        return;
      }
      await this.loadSummary();
      wx.showToast({ title: '绑定成功', icon: 'success' });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '绑定失败',
        icon: 'none',
      });
    } finally {
      this.setData({ binding: false });
    }
  },

  async bindPhone(input: { phoneCode?: string; displayName?: string }) {
    await this.bindPhoneWithToken(this.data.bindToken, input);
  },

  onPhoneAuth(event: PhoneAuthEvent) {
    const code = event.detail.code;
    if (!code) {
      wx.showToast({ title: event.detail.errMsg || '未授权手机号', icon: 'none' });
      return;
    }
    this.bindPhone({ phoneCode: code });
  },

  async onLogout() {
    try {
      await logout();
    } catch {
      // Local token cleanup is enough for Mini Program logout.
    }
    clearToken();
    this.resetAccountState();
    wx.showToast({ title: '已退出', icon: 'success' });
  },
});
