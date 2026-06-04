import {
  bindWechatMiniPhone,
  clearToken,
  fetchMe,
  fetchParentAttendance,
  fetchParentChildren,
  fetchParentLessonAccounts,
  fetchParentNotifications,
  fetchParentOrders,
  hasToken,
  logout,
  markParentNotificationRead,
  setToken,
  wechatMiniLogin,
  type AuthAccount,
  type ParentAttendance,
  type ParentChild,
  type ParentLessonAccount,
  type ParentNotification,
  type ParentOrder,
} from '../../services/api';
import { formatDateTime, money } from '../../utils/format';

type LessonAccountItem = ParentLessonAccount & {
  courseName: string;
  studentName: string;
  updatedAtLabel: string;
};

type OrderItem = ParentOrder & {
  amountLabel: string;
  createdAtLabel: string;
  packageName: string;
  statusLabel: string;
  studentName: string;
  courseName: string;
};

type AttendanceItem = ParentAttendance & {
  startsAtLabel: string;
  statusLabel: string;
  studentName: string;
};

type NotificationItem = ParentNotification & {
  createdAtLabel: string;
  statusLabel: string;
};

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待支付',
    paid: '已支付',
    cancelled: '已取消',
    refunded: '已退款',
  };
  return labels[status] || status;
}

function attendanceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    present: '到课',
    leave: '请假',
    absent: '缺勤',
    makeup: '补课',
    trial: '试听',
  };
  return labels[status] || status;
}

function notificationStatusLabel(status: string): string {
  if (status === 'unread') return '未读';
  if (status === 'read') return '已读';
  return status;
}

function emptyStats() {
  return {
    childCount: 0,
    totalBalance: 0,
    pendingOrders: 0,
    unreadNotifications: 0,
  };
}

Page({
  data: {
    loading: false,
    refreshing: false,
    binding: false,
    bindToken: '',
    account: null as AuthAccount | null,
    defaultPassword: '',
    children: [] as ParentChild[],
    lessonAccounts: [] as LessonAccountItem[],
    orders: [] as OrderItem[],
    attendance: [] as AttendanceItem[],
    notifications: [] as NotificationItem[],
    stats: emptyStats(),
  },

  onShow() {
    if (hasToken()) {
      this.loadSession();
    }
  },

  async loadSession() {
    this.setData({ refreshing: true });
    try {
      const payload = await fetchMe();
      if (!payload.account || payload.account.role !== 'parent') {
        clearToken();
        this.resetAccountState();
        return;
      }
      this.setData({ account: payload.account, bindToken: '' });
      await this.loadParentCenter();
    } catch {
      clearToken();
      this.resetAccountState();
    } finally {
      this.setData({ refreshing: false });
    }
  },

  async loadParentCenter() {
    if (!this.data.account) return;
    this.setData({ refreshing: true });
    try {
      const [children, lessonAccounts, orders, attendance, notifications] = await Promise.all([
        fetchParentChildren(),
        fetchParentLessonAccounts(),
        fetchParentOrders(),
        fetchParentAttendance(),
        fetchParentNotifications(),
      ]);

      const lessonItems: LessonAccountItem[] = lessonAccounts.map((item) => ({
        ...item,
        courseName: item.course?.name || '未知课程',
        studentName: item.student?.name || '未知学员',
        updatedAtLabel: formatDateTime(item.updatedAt),
      }));
      const orderItems: OrderItem[] = orders.map((item) => ({
        ...item,
        amountLabel: money(item.amount),
        createdAtLabel: formatDateTime(item.createdAt),
        packageName: item.package?.name || `${item.lessonCount} 课时包`,
        statusLabel: orderStatusLabel(item.status),
        studentName: item.student?.name || '未关联学员',
        courseName: item.course?.name || '未关联课程',
      }));
      const attendanceItems: AttendanceItem[] = attendance.map((item) => ({
        ...item,
        startsAtLabel: formatDateTime(item.startsAt),
        statusLabel: attendanceStatusLabel(item.status),
        studentName: item.student?.name || '未知学员',
      }));
      const notificationItems: NotificationItem[] = notifications.map((item) => ({
        ...item,
        createdAtLabel: formatDateTime(item.createdAt),
        statusLabel: notificationStatusLabel(item.status),
      }));

      this.setData({
        children,
        lessonAccounts: lessonItems,
        orders: orderItems,
        attendance: attendanceItems,
        notifications: notificationItems,
        stats: {
          childCount: children.length,
          totalBalance: lessonItems.reduce((sum, item) => sum + item.balance, 0),
          pendingOrders: orderItems.filter((item) => item.status === 'pending').length,
          unreadNotifications: notificationItems.filter((item) => item.status === 'unread').length,
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '家长中心加载失败',
        icon: 'none',
      });
    } finally {
      this.setData({ refreshing: false });
    }
  },

  resetAccountState() {
    this.setData({
      account: null,
      bindToken: '',
      defaultPassword: '',
      children: [],
      lessonAccounts: [],
      orders: [],
      attendance: [],
      notifications: [],
      stats: emptyStats(),
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
            this.setData({ account: payload.account, bindToken: '', defaultPassword: '' });
            await this.loadParentCenter();
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
      const payload = await bindWechatMiniPhone({
        bindToken,
        ...input,
      });
      setToken(payload.token);
      this.setData({
        account: payload.account,
        bindToken: '',
        defaultPassword: payload.defaultPassword || '',
      });
      await this.loadParentCenter();
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

  async onBindSubmit(event: {
    detail: {
      value: {
        phone?: string;
        displayName?: string;
      };
    };
  }) {
    const phone = (event.detail.value.phone || '').trim();
    const displayName = (event.detail.value.displayName || '').trim();
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }

    await this.bindPhone({
      phone,
      displayName: displayName || undefined,
    });
  },

  async onMarkNotificationRead(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    try {
      const updated = await markParentNotificationRead(id);
      const currentNotifications = this.data.notifications as NotificationItem[];
      const notifications = currentNotifications.map((item: NotificationItem) =>
        item.id === id
          ? {
              ...item,
              status: updated.status,
              statusLabel: notificationStatusLabel(updated.status),
            }
          : item,
      );
      this.setData({
        notifications,
        stats: {
          ...this.data.stats,
          unreadNotifications: notifications.filter((item) => item.status === 'unread').length,
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      });
    }
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

  goCourses() {
    wx.navigateTo({ url: '/pages/courses/index' });
  },

  goTeachers() {
    wx.navigateTo({ url: '/pages/teachers/index' });
  },
});
