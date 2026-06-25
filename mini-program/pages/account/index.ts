import {
  bindWechatMiniPhone,
  clearToken,
  fetchMe,
  fetchParentChildren,
  fetchParentLessonAccounts,
  fetchParentNotifications,
  fetchParentOrders,
  hasToken,
  logout,
  setToken,
  wechatMiniLogin,
  type AuthAccount,
} from '../../services/api';

type HubStats = {
  childCount: number;
  totalBalance: number;
  pendingOrders: number;
  unreadNotifications: number;
};

function emptyStats(): HubStats {
  return { childCount: 0, totalBalance: 0, pendingOrders: 0, unreadNotifications: 0 };
}

const ENTRIES = [
  {
    key: 'students',
    icon: '👶',
    label: '学员与课时',
    desc: '孩子档案与课时余额',
    url: '/pages/account-students/index',
  },
  {
    key: 'orders',
    icon: '🧾',
    label: '订单',
    desc: '购买与支付记录',
    url: '/pages/account-orders/index',
  },
  {
    key: 'trials',
    icon: '🎟',
    label: '试听席位',
    desc: '预约、改期与到课',
    url: '/pages/account-trials/index',
  },
  {
    key: 'attendance',
    icon: '✅',
    label: '上课签到',
    desc: '签到与到课记录',
    url: '/pages/account-attendance/index',
  },
  {
    key: 'homework',
    icon: '📷',
    label: '作业打卡',
    desc: '上传作业、查看批阅',
    url: '/pages/account-homework/index',
  },
  {
    key: 'notifications',
    icon: '🔔',
    label: '消息通知',
    desc: '提醒订阅与站内消息',
    url: '/pages/account-notifications/index',
  },
];

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
    entries: ENTRIES,
    stats: emptyStats(),
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
      const [children, lessonAccounts, orders, notifications] = await Promise.all([
        fetchParentChildren(),
        fetchParentLessonAccounts(),
        fetchParentOrders(),
        fetchParentNotifications(),
      ]);
      this.setData({
        stats: {
          childCount: children.length,
          totalBalance: lessonAccounts.reduce((sum, item) => sum + item.balance, 0),
          pendingOrders: orders.filter((item) => item.status === 'pending').length,
          unreadNotifications: notifications.filter((item) => item.status === 'unread').length,
        },
      });
      this.updateTabBadge(notifications.filter((item) => item.status === 'unread').length);
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
