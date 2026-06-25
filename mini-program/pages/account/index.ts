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
  desc: string;
  url: string;
  badge: number;
};

function nextThirtyDays() {
  const from = new Date();
  const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const ENTRIES = [
  {
    key: 'schedule',
    symbol: '课',
    label: '课程',
    desc: '课表与签到',
    url: '/pages/account-attendance/index',
  },
  {
    key: 'feedbacks',
    symbol: '评',
    label: '点评',
    desc: '课后反馈',
    url: '/pages/account-feedbacks/index',
  },
  {
    key: 'students',
    symbol: '孩',
    label: '学员与课时',
    desc: '孩子档案与课时余额',
    url: '/pages/account-students/index',
  },
  {
    key: 'orders',
    symbol: '单',
    label: '订单',
    desc: '购买与支付记录',
    url: '/pages/account-orders/index',
  },
  {
    key: 'trials',
    symbol: '试',
    label: '试听席位',
    desc: '预约、改期与到课',
    url: '/pages/account-trials/index',
  },
  {
    key: 'homework',
    symbol: '作',
    label: '作业打卡',
    desc: '上传作业、查看批阅',
    url: '/pages/account-homework/index',
  },
  {
    key: 'notifications',
    symbol: '信',
    label: '消息通知',
    desc: '提醒订阅与站内消息',
    url: '/pages/account-notifications/index',
  },
] satisfies Array<Omit<QuickEntry, 'badge'>>;

const ACCOUNT_TAB_INDEX = 2;

Page({
  data: {
    loading: false,
    binding: false,
    refreshing: false,
    booting: false,
    bindToken: '',
    account: null as AuthAccount | null,
    defaultPassword: '',
    avatarText: '我',
    entries: ENTRIES.map((entry) => ({ ...entry, badge: 0 })) as QuickEntry[],
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
      this.loadSummary().finally(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
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
        this.setData({ refreshing: false, booting: false });
        wx.navigateTo({ url: '/pages/teacher-workbench/index' });
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
        entries: ENTRIES.map((entry) => ({
          ...entry,
          badge:
            entry.key === 'schedule'
              ? pendingCheckIns
              : entry.key === 'orders'
                ? pendingOrders
                : entry.key === 'trials'
                  ? pendingReservations
                  : entry.key === 'notifications'
                    ? unreadNotifications
                    : 0,
        })),
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
      defaultPassword: '',
      avatarText: '我',
      stats: emptyStats(),
      childSummaries: [],
      nextLesson: null,
      latestFeedback: null,
      todoItems: [],
      entries: ENTRIES.map((entry) => ({ ...entry, badge: 0 })),
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

  onWechatLogin() {
    this.setData({ loading: true });
    wx.login({
      success: async (result) => {
        try {
          const payload = await wechatMiniLogin(result.code);
          if (payload.bound) {
            setToken(payload.token);
            if (payload.account.role === 'teacher') {
              wx.navigateTo({ url: '/pages/teacher-workbench/index' });
              return;
            }
            this.applyAccount(payload.account);
            this.setData({ defaultPassword: '' });
            await this.loadSummary();
            wx.showToast({ title: '登录成功', icon: 'success' });
          } else {
            clearToken();
            this.resetAccountState();
            this.setData({ bindToken: payload.bindToken });
            wx.showToast({ title: '请绑定手机号', icon: 'none' });
          }
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

  async bindPhone(input: { phone?: string; phoneCode?: string; displayName?: string }) {
    const bindToken = this.data.bindToken;
    if (!bindToken) {
      wx.showToast({ title: '请先微信登录', icon: 'none' });
      return;
    }

    this.setData({ binding: true });
    try {
      const payload = await bindWechatMiniPhone({ bindToken, ...input });
      setToken(payload.token);
      this.applyAccount(payload.account);
      this.setData({ defaultPassword: payload.defaultPassword || '' });
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

  onPhoneAuth(event: { detail: { code?: string; errMsg?: string } }) {
    const code = event.detail.code;
    if (!code) {
      wx.showToast({ title: event.detail.errMsg || '未授权手机号', icon: 'none' });
      return;
    }
    this.bindPhone({ phoneCode: code });
  },

  async onBindSubmit(event: { detail: { value: { phone?: string; displayName?: string } } }) {
    const phone = (event.detail.value.phone || '').trim();
    const displayName = (event.detail.value.displayName || '').trim();
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    await this.bindPhone({ phone, displayName: displayName || undefined });
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
