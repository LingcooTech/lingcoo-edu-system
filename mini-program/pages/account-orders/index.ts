import { fetchParentOrders, hasToken } from '../../services/api';
import { toOrderItem, type OrderItem } from '../../utils/parent-center';

Page({
  data: {
    loading: true,
    needLogin: false,
    orders: [] as OrderItem[],
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
      const orders = await fetchParentOrders();
      this.setData({ orders: orders.map(toOrderItem), needLogin: false, loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },
});
