import {
  bindWechatMiniPhone,
  clearToken,
  fetchMe,
  fetchParentAttendance,
  fetchParentChildren,
  fetchParentLessonAccounts,
  fetchParentNotifications,
  fetchParentOrders,
  fetchParentSeatReservations,
  hasToken,
  logout,
  markParentNotificationRead,
  rescheduleParentSeatReservation,
  setToken,
  wechatMiniLogin,
  type AuthAccount,
  type ParentAttendance,
  type ParentChild,
  type ParentLessonAccount,
  type ParentNotification,
  type ParentOrder,
  type ParentSeatReservation,
} from '../../services/api';
import { requestSubscribe } from '../../services/subscribe';
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

type SeatReservationItem = ParentSeatReservation & {
  courseName: string;
  feeLabel: string;
  startsAtLabel: string;
  campusName: string;
  reservationStatusLabel: string;
  paymentStatusLabel: string;
  checkInStatusLabel: string;
  rescheduleOptionLabels: string[];
  canSelfReschedule: boolean;
};

type NotificationItem = ParentNotification & {
  createdAtLabel: string;
  statusLabel: string;
};

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待支付',
    unpaid: '未支付',
    paid: '已支付',
    cancelled: '已取消',
    refunded: '已退款',
  };
  return labels[status] || status;
}

function reservationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_payment: '待支付',
    reserved: '已保留',
    cancelled: '已取消',
    expired: '已过期',
  };
  return labels[status] || status;
}

function checkInStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待到课',
    checked_in: '已签到',
    no_show: '未到课',
  };
  return labels[status] || status;
}

function orderTitle(order: ParentOrder): string {
  if (order.orderType === 'seat_reservation') return '试听席位保留费';
  if (order.orderType === 'manual_package_grant') return order.package?.name || '线下课时包';
  return order.package?.name || `${order.lessonCount} 课时包`;
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
    subscribingReminders: false,
    bindToken: '',
    account: null as AuthAccount | null,
    defaultPassword: '',
    children: [] as ParentChild[],
    lessonAccounts: [] as LessonAccountItem[],
    seatReservations: [] as SeatReservationItem[],
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
      const [children, lessonAccounts, seatReservations, orders, attendance, notifications] =
        await Promise.all([
          fetchParentChildren(),
          fetchParentLessonAccounts(),
          fetchParentSeatReservations(),
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
        packageName: orderTitle(item),
        statusLabel: orderStatusLabel(item.status),
        studentName: item.student?.name || '未关联学员',
        courseName: item.course?.name || '未关联课程',
      }));
      const seatItems: SeatReservationItem[] = seatReservations.map((item) => ({
        ...item,
        courseName: item.course?.name || '课程待确认',
        feeLabel: money(item.reservationFeeAmount),
        startsAtLabel: item.trialSession
          ? formatDateTime(item.trialSession.startsAt)
          : '时间待确认',
        campusName: item.campus?.name || '地点待确认',
        reservationStatusLabel: reservationStatusLabel(item.reservationStatus),
        paymentStatusLabel: orderStatusLabel(item.paymentStatus),
        checkInStatusLabel: checkInStatusLabel(item.checkInStatus),
        rescheduleOptionLabels: item.rescheduleOptions.map(
          (session) =>
            `${session.title} · ${formatDateTime(session.startsAt)} · ${session.bookedCount}/${session.capacity}`,
        ),
        canSelfReschedule: item.canReschedule && item.rescheduleOptions.length > 0,
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
        seatReservations: seatItems,
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
      seatReservations: [],
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

  async onRescheduleSeatReservation(event: {
    currentTarget: { dataset: { id?: string } };
    detail: { value?: string | number };
  }) {
    const id = event.currentTarget.dataset.id;
    const optionIndex = Number(event.detail.value ?? -1);
    if (!id || Number.isNaN(optionIndex)) return;

    const reservation = (this.data.seatReservations as SeatReservationItem[]).find(
      (item) => item.id === id,
    );
    const target = reservation?.rescheduleOptions[optionIndex];
    const label = reservation?.rescheduleOptionLabels[optionIndex];
    if (!reservation || !target || !label) return;

    wx.showModal({
      title: '确认改期',
      content: `改到：${label}`,
      confirmText: '确认',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await rescheduleParentSeatReservation(reservation.id, target.id);
          await this.loadParentCenter();
          wx.showToast({ title: '改期成功', icon: 'success' });
        } catch (error) {
          wx.showToast({
            title: error instanceof Error ? error.message : '改期失败',
            icon: 'none',
          });
        }
      },
    });
  },

  async onSubscribeLessonNotifications() {
    this.setData({ subscribingReminders: true });
    try {
      const result = await requestSubscribe(['lesson_reminder', 'lesson_consumed']);
      const accepted = Object.values(result).some((value) => value === 'accept');
      wx.showToast({
        title: accepted ? '订阅成功' : '未授权',
        icon: accepted ? 'success' : 'none',
      });
    } finally {
      this.setData({ subscribingReminders: false });
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
