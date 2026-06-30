import {
  clearToken,
  fetchMe,
  fetchParentNotifications,
  fetchParentOrders,
  hasToken,
  logout,
  type AuthAccount,
} from '../../services/api';

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
    account: null as AuthAccount | null,
    avatarText: '家',
    stats: emptyStats(),
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
      this.setData({ needLogin: true, loading: false, account: null, stats: emptyStats() });
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
        this.setData({ needLogin: true, loading: false, account: null, stats: emptyStats() });
        return;
      }
      const source = account.displayName || account.phone || '家长';
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
