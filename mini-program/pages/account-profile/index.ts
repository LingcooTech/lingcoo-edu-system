import {
  clearToken,
  fetchMe,
  fetchParentNotifications,
  fetchParentOrders,
  hasToken,
  logout,
  markParentNotificationRead,
  type AuthAccount,
} from '../../services/api';
import {
  notificationStatusLabel,
  toNotificationItem,
  toOrderItem,
  type NotificationItem,
  type OrderItem,
} from '../../utils/parent-center';
import { requestSubscribe } from '../../services/subscribe';

type ProfileStats = {
  orderCount: number;
  pendingOrders: number;
  pendingOrdersLabel: string;
  unreadNotifications: number;
  unreadNotificationsLabel: string;
};

function emptyStats(): ProfileStats {
  return {
    orderCount: 0,
    pendingOrders: 0,
    pendingOrdersLabel: '全部',
    unreadNotifications: 0,
    unreadNotificationsLabel: '查看',
  };
}

Page({
  data: {
    loading: true,
    needLogin: false,
    loggingOut: false,
    subscribingReminders: false,
    account: null as AuthAccount | null,
    avatarText: '家',
    stats: emptyStats(),
    activeTab: 'notifications' as 'notifications' | 'orders',
    notifications: [] as NotificationItem[],
    orders: [] as OrderItem[],
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onSwitchTab(event: { currentTarget: { dataset: { tab?: 'notifications' | 'orders' } } }) {
    const tab = event.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  goLogin() {
    wx.switchTab({ url: '/pages/account/index' });
  },

  async load() {
    if (!hasToken()) {
      this.setData({
        needLogin: true,
        loading: false,
        account: null,
        stats: emptyStats(),
        notifications: [],
        orders: [],
      });
      return;
    }
    this.setData({ loading: true });
    try {
      const [me, orders, notifications] = await Promise.all([
        fetchMe(),
        fetchParentOrders(),
        fetchParentNotifications(),
      ]);
      const account = me.account;
      if (!account || account.role !== 'parent') {
        clearToken();
        this.setData({
          needLogin: true,
          loading: false,
          account: null,
          stats: emptyStats(),
          notifications: [],
          orders: [],
        });
        return;
      }
      const source = account.displayName || account.phone || '微信用户';
      const pendingOrders = orders.filter((item) => item.status === 'pending').length;
      const unreadNotifications = notifications.filter((item) => item.status === 'unread').length;
      this.setData({
        account,
        avatarText: source.slice(0, 1).toUpperCase(),
        stats: {
          orderCount: orders.length,
          pendingOrders,
          pendingOrdersLabel: pendingOrders ? `${pendingOrders} 待付款` : '全部',
          unreadNotifications,
          unreadNotificationsLabel: unreadNotifications ? `${unreadNotifications} 未读` : '查看',
        },
        notifications: notifications.map(toNotificationItem),
        orders: orders.map(toOrderItem),
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

  async onMarkNotificationRead(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    try {
      const updated = await markParentNotificationRead(id);
      const notifications = (this.data.notifications as NotificationItem[]).map((item) =>
        item.id === id
          ? {
              ...item,
              status: updated.status,
              statusLabel: notificationStatusLabel(updated.status),
            }
          : item,
      );
      const unreadNotifications = notifications.filter((item) => item.status === 'unread').length;
      this.setData({
        notifications,
        stats: {
          ...this.data.stats,
          unreadNotifications,
          unreadNotificationsLabel: unreadNotifications ? `${unreadNotifications} 未读` : '查看',
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      });
    }
  },

  async onSubscribeLessonNotifications() {
    this.setData({ subscribingReminders: true });
    try {
      const result = await requestSubscribe([
        'lesson_reminder',
        'lesson_consumed',
        'learning_update',
      ]);
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
    if (this.data.loggingOut) return;
    this.setData({ loggingOut: true });
    try {
      await logout();
    } catch {
      // Local token cleanup is enough for Mini Program logout.
    }
    clearToken();
    this.setData({ loggingOut: false });
    wx.switchTab({ url: '/pages/account/index' });
  },
});
