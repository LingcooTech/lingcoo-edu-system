import {
  bindWechatMiniPhone,
  clearToken,
  fetchMe,
  fetchParentChildren,
  fetchParentCheckInSessions,
  fetchParentHomeworkAssignments,
  fetchParentHomeworkCheckIns,
  fetchParentLessonAccounts,
  fetchParentLessonFeedbacks,
  fetchParentNotifications,
  fetchParentOrders,
  fetchParentSeatReservations,
  fetchTeacherProfile,
  hasToken,
  logout,
  setToken,
  submitParentCheckIn,
  switchWorkRole,
  wechatMiniLogin,
  type AuthAccount,
  type ParentSeatReservation,
  type TeacherOwnProfile,
} from '../../services/api';
import {
  orderStatusLabel,
  reservationStatusLabel,
  toCheckInItem,
  type CheckInItem,
} from '../../utils/parent-center';
import { formatDateTime } from '../../utils/format';
import { GUEST_ACCOUNT_ICONS } from '../../utils/icons';
import { toUserFacingMessage } from '../../utils/user-facing-message';

type HubStats = {
  childCount: number;
  totalBalance: number;
  interactionStars: number;
  pendingTasks: number;
  unreadNotifications: number;
  homeworkAssignments: number;
};

function emptyStats(): HubStats {
  return {
    childCount: 0,
    totalBalance: 0,
    interactionStars: 0,
    pendingTasks: 0,
    unreadNotifications: 0,
    homeworkAssignments: 0,
  };
}

type NextLessonCard = CheckInItem & {
  dateLabel: string;
  timeRangeLabel: string;
  courseLine: string;
  classLine: string;
  locationLine: string;
};

type ReservationReminder = {
  title: string;
  courseLine: string;
  timeLine: string;
  locationLine: string;
  statusLine: string;
};

type PhoneAuthEvent = { detail: { code?: string; errMsg?: string } };

function currentMonthStartsAt() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function isCurrentMonth(value?: string | null) {
  if (!value) return false;
  return new Date(value).getTime() >= currentMonthStartsAt();
}

const ACCOUNT_TAB_INDEX = 4;

function canSwitchWorkRole(account: AuthAccount | null) {
  if (!account) return false;
  const activeRoles = (account.roles ?? [])
    .filter((role) => role.status === 'active')
    .map((role) => role.role);
  return activeRoles.includes('admin') && activeRoles.includes('teacher');
}

function timeLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dateLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekdays[date.getDay()]}`;
}

function toNextLessonCard(item: CheckInItem): NextLessonCard {
  return {
    ...item,
    dateLabel: dateLabel(item.startsAt),
    timeRangeLabel: `${timeLabel(item.startsAt)}-${timeLabel(item.endsAt)}`,
    courseLine: item.courseName,
    classLine: item.class?.name || '班级待确认',
    locationLine: item.classroomName,
  };
}

function reservationTimeValue(item: ParentSeatReservation): number {
  const value = item.trialSession?.startsAt || item.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function isActiveReservation(item: ParentSeatReservation): boolean {
  if (item.reservationStatus === 'cancelled' || item.reservationStatus === 'expired') {
    return false;
  }
  if (item.checkInStatus === 'checked_in' || item.checkInStatus === 'no_show') {
    return false;
  }
  return true;
}

function toReservationReminder(items: ParentSeatReservation[]): ReservationReminder | null {
  const reservation = items
    .filter(isActiveReservation)
    .sort((a, b) => reservationTimeValue(a) - reservationTimeValue(b))[0];
  if (!reservation) return null;
  return {
    title: reservation.trialSession?.title || reservation.course?.name || '预约试听',
    courseLine: reservation.course?.name || '课程待确认',
    timeLine: reservation.trialSession?.startsAt
      ? formatDateTime(reservation.trialSession.startsAt)
      : '时间待确认',
    locationLine: reservation.campus?.name || '空间待确认',
    statusLine: `${reservationStatusLabel(reservation.reservationStatus)} · ${orderStatusLabel(
      reservation.paymentStatus,
    )}`,
  };
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
    teacherProfile: null as TeacherOwnProfile | null,
    teacherProfileLoading: false,
    canSwitchWorkRole: false,
    switchingRole: false,
    defaultPassword: '',
    avatarText: '我',
    guestIcons: GUEST_ACCOUNT_ICONS,
    stats: emptyStats(),
    nextLesson: null as NextLessonCard | null,
    reservationReminder: null as ReservationReminder | null,
    checkingInKey: '',
  },

  onShow() {
    if (hasToken()) {
      this.setData({ booting: !this.data.account });
      this.loadSession();
    } else {
      this.resetAccountState();
    }
  },

  onPullDownRefresh() {
    if (hasToken()) {
      if (this.data.account?.role === 'admin') {
        const panel = this.selectComponent('#adminDashboard') as {
          refresh?: () => Promise<void>;
        } | null;
        Promise.resolve(panel?.refresh?.()).finally(() => wx.stopPullDownRefresh());
        return;
      }
      if (this.data.account?.role === 'teacher') {
        this.loadTeacherProfile().finally(() => wx.stopPullDownRefresh());
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
      if (payload.account.role === 'admin' || payload.account.role === 'teacher') {
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
      canSwitchWorkRole: canSwitchWorkRole(account),
      bindToken: '',
      avatarText: source.slice(0, 1).toUpperCase(),
    });
    if (account.role === 'teacher') {
      void this.loadTeacherProfile();
    } else {
      this.setData({ teacherProfile: null, teacherProfileLoading: false });
    }
  },

  async loadTeacherProfile() {
    if (this.data.account?.role !== 'teacher') return;
    this.setData({ teacherProfileLoading: true });
    try {
      const teacherProfile = await fetchTeacherProfile();
      const source =
        teacherProfile.teacher.name ||
        teacherProfile.account.displayName ||
        teacherProfile.account.phone ||
        '我';
      this.setData({
        teacherProfile,
        avatarText: source.slice(0, 1).toUpperCase(),
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '老师资料加载失败',
        icon: 'none',
      });
    } finally {
      this.setData({ teacherProfileLoading: false });
    }
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
        homeworkAssignments,
        lessonFeedbacks,
      ] = await Promise.all([
        fetchParentChildren(),
        fetchParentLessonAccounts(),
        fetchParentOrders(),
        fetchParentNotifications(),
        fetchParentCheckInSessions(),
        fetchParentSeatReservations(),
        fetchParentHomeworkCheckIns(),
        fetchParentHomeworkAssignments(),
        fetchParentLessonFeedbacks(),
      ]);
      const pendingOrders = orders.filter((item) => item.status === 'pending').length;
      const pendingReservations = seatReservations.filter(
        (item) =>
          item.paymentStatus === 'unpaid' ||
          item.paymentStatus === 'pending' ||
          item.reservationStatus === 'pending_payment',
      ).length;
      const checkInItems = checkInSessions
        .map(toCheckInItem)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      const unreadNotifications = notifications.filter((item) => item.status === 'unread').length;
      const interactionStars =
        lessonFeedbacks
          .filter((item) => isCurrentMonth(item.createdAt))
          .reduce((sum, item) => sum + Math.max(0, Number(item.rating || 0)), 0) +
        homeworkCheckIns
          .filter((item) => isCurrentMonth(item.reviewedAt || item.updatedAt))
          .reduce((sum, item) => sum + Math.max(0, Number(item.rating || 0)), 0);
      const pendingTasks = pendingOrders + pendingReservations;
      this.setData({
        stats: {
          childCount: children.length,
          totalBalance: lessonAccounts.reduce((sum, item) => sum + item.balance, 0),
          interactionStars,
          pendingTasks,
          unreadNotifications,
          homeworkAssignments: homeworkAssignments.length,
        },
        nextLesson: checkInItems[0] ? toNextLessonCard(checkInItems[0]) : null,
        reservationReminder: toReservationReminder(seatReservations),
      });
      this.updateTabBadge(unreadNotifications);
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '成长中心加载失败',
        icon: 'none',
      });
    }
  },

  resetAccountState() {
    this.setData({
      account: null,
      teacherProfile: null,
      teacherProfileLoading: false,
      canSwitchWorkRole: false,
      switchingRole: false,
      bindToken: '',
      loginSheetVisible: false,
      defaultPassword: '',
      avatarText: '我',
      stats: emptyStats(),
      nextLesson: null,
      reservationReminder: null,
      checkingInKey: '',
    });
    this.updateTabBadge(0);
  },

  async onSwitchWorkRole() {
    if (!this.data.account || !this.data.canSwitchWorkRole || this.data.switchingRole) return;
    const targetRole = this.data.account.role === 'admin' ? 'teacher' : 'admin';
    this.setData({ switchingRole: true });
    try {
      const payload = await switchWorkRole(targetRole);
      setToken(payload.token);
      this.applyAccount(payload.account);
      this.updateTabBadge(0);
      wx.showToast({
        title: targetRole === 'admin' ? '已切到管理看板' : '已切到老师工作台',
        icon: 'success',
      });
      if (targetRole === 'teacher') {
        setTimeout(() => this.openTeacherWorkbench(), 300);
      }
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '切换身份失败',
        icon: 'none',
      });
    } finally {
      this.setData({ switchingRole: false });
    }
  },

  async onParentCheckIn(event: {
    currentTarget: { dataset: { sessionId?: string; studentId?: string; key?: string } };
  }) {
    const { sessionId, studentId, key } = event.currentTarget.dataset;
    if (!sessionId || !studentId || !key) return;
    if (this.data.checkingInKey) return;
    this.setData({ checkingInKey: key });
    try {
      const result = await submitParentCheckIn(sessionId, studentId);
      await this.loadSummary();
      wx.showToast({ title: result.message || '签到成功', icon: 'success' });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '签到失败',
        icon: 'none',
      });
    } finally {
      this.setData({ checkingInKey: '' });
    }
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
            if (payload.account.role === 'admin' || payload.account.role === 'teacher') {
              this.applyAccount(payload.account);
              this.setData({ defaultPassword: '', bindToken: '', loginSheetVisible: false });
              this.updateTabBadge(0);
              wx.showToast({ title: '登录成功', icon: 'success' });
              if (payload.account.role === 'teacher') {
                setTimeout(() => this.openTeacherWorkbench(), 300);
              }
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
        wx.showToast({ title: toUserFacingMessage(error.errMsg, '登录失败'), icon: 'none' });
      },
    });
  },

  onWechatLogin(event?: PhoneAuthEvent) {
    const phoneCode = event?.detail?.code;
    if (event?.detail?.errMsg && !phoneCode) {
      wx.showToast({ title: '将尝试使用已绑定账号登录', icon: 'none' });
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

  openTeacherWorkbench() {
    wx.navigateTo({
      url: '/pages/teacher-workbench/index',
      fail: () => wx.redirectTo({ url: '/pages/teacher-workbench/index' }),
    });
  },

  async bindPhoneWithToken(bindToken: string, input: { phoneCode?: string; displayName?: string }) {
    if (!bindToken) {
      wx.showToast({ title: '请先完成快捷登录', icon: 'none' });
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
      if (payload.account.role === 'admin' || payload.account.role === 'teacher') {
        this.updateTabBadge(0);
        wx.showToast({ title: '绑定成功', icon: 'success' });
        if (payload.account.role === 'teacher') {
          setTimeout(() => this.openTeacherWorkbench(), 300);
        }
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
      wx.showToast({
        title: toUserFacingMessage(event.detail.errMsg, '未授权手机号'),
        icon: 'none',
      });
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
