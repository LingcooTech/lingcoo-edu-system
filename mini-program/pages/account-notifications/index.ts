import { fetchParentNotifications, hasToken, markParentNotificationRead } from '../../services/api';
import { requestSubscribe } from '../../services/subscribe';
import {
  notificationStatusLabel,
  toNotificationItem,
  type NotificationItem,
} from '../../utils/parent-center';

Page({
  data: {
    loading: true,
    needLogin: false,
    subscribingReminders: false,
    notifications: [] as NotificationItem[],
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
      const notifications = await fetchParentNotifications();
      this.setData({
        notifications: notifications.map(toNotificationItem),
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
          ? { ...item, status: updated.status, statusLabel: notificationStatusLabel(updated.status) }
          : item,
      );
      this.setData({ notifications });
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
});
