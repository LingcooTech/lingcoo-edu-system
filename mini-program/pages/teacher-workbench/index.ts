import {
  clearToken,
  fetchMe,
  setToken,
  switchWorkRole,
  type AuthAccount,
} from '../../services/api';

function canSwitchWorkRole(account: AuthAccount | null) {
  if (!account) return false;
  const activeRoles = (account.roles ?? [])
    .filter((role) => role.status === 'active')
    .map((role) => role.role);
  return activeRoles.includes('admin') && activeRoles.includes('teacher');
}

Page({
  data: {
    account: null as AuthAccount | null,
    canSwitchWorkRole: false,
    switchingRole: false,
  },

  onShow() {
    this.loadSession();
  },

  onPullDownRefresh() {
    const panel = this.selectComponent('#teacherWorkbench') as
      | { refresh?: () => Promise<void> }
      | null;
    Promise.resolve(panel?.refresh?.()).finally(() => wx.stopPullDownRefresh());
  },

  async loadSession() {
    try {
      const payload = await fetchMe();
      this.setData({
        account: payload.account,
        canSwitchWorkRole: canSwitchWorkRole(payload.account),
      });
    } catch {
      clearToken();
      this.setData({ account: null, canSwitchWorkRole: false });
    }
  },

  async onSwitchWorkRole() {
    if (!this.data.canSwitchWorkRole || this.data.switchingRole) return;
    this.setData({ switchingRole: true });
    try {
      const payload = await switchWorkRole('admin');
      setToken(payload.token);
      wx.showToast({ title: '已切到管理看板', icon: 'success' });
      wx.switchTab({ url: '/pages/account/index' });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '切换身份失败',
        icon: 'none',
      });
    } finally {
      this.setData({ switchingRole: false });
    }
  },
});
