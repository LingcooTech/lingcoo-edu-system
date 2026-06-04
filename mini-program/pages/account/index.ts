import {
  bindWechatMiniPhone,
  setToken,
  wechatMiniLogin,
  type AuthAccount,
} from '../../services/api';

Page({
  data: {
    loading: false,
    binding: false,
    bindToken: '',
    account: null as AuthAccount | null,
    defaultPassword: '',
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
            wx.showToast({ title: '登录成功', icon: 'success' });
          } else {
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

  async onBindSubmit(event: {
    detail: {
      value: {
        phone?: string;
        displayName?: string;
      };
    };
  }) {
    const bindToken = this.data.bindToken;
    const phone = (event.detail.value.phone || '').trim();
    const displayName = (event.detail.value.displayName || '').trim();
    if (!bindToken) {
      wx.showToast({ title: '请先微信登录', icon: 'none' });
      return;
    }
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }

    this.setData({ binding: true });
    try {
      const payload = await bindWechatMiniPhone({
        bindToken,
        phone,
        displayName: displayName || undefined,
      });
      setToken(payload.token);
      this.setData({
        account: payload.account,
        bindToken: '',
        defaultPassword: payload.defaultPassword || '',
      });
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

  goCourses() {
    wx.navigateTo({ url: '/pages/courses/index' });
  },

  goTeachers() {
    wx.navigateTo({ url: '/pages/teachers/index' });
  },
});
