import {
  clearToken,
  fetchMe,
  fetchParentOrders,
  fetchParentSeatReservations,
  hasToken,
} from '../../services/api';
import {
  toOrderItem,
  toSeatReservationItem,
  type OrderItem,
  type SeatReservationItem,
} from '../../utils/parent-center';

function isPendingReservation(item: { paymentStatus: string; reservationStatus: string }) {
  return (
    item.paymentStatus === 'unpaid' ||
    item.paymentStatus === 'pending' ||
    item.reservationStatus === 'pending_payment'
  );
}

Page({
  data: {
    loading: true,
    needLogin: false,
    pendingOrders: [] as OrderItem[],
    pendingReservations: [] as SeatReservationItem[],
    pendingCount: 0,
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
      this.setData({
        loading: false,
        needLogin: true,
        pendingOrders: [],
        pendingReservations: [],
        pendingCount: 0,
      });
      return;
    }

    this.setData({ loading: true });
    try {
      const [me, orders, seatReservations] = await Promise.all([
        fetchMe(),
        fetchParentOrders(),
        fetchParentSeatReservations(),
      ]);
      if (!me.account || me.account.role !== 'parent') {
        clearToken();
        this.setData({
          loading: false,
          needLogin: true,
          pendingOrders: [],
          pendingReservations: [],
          pendingCount: 0,
        });
        return;
      }

      const pendingOrders = orders.filter((item) => item.status === 'pending').map(toOrderItem);
      const pendingReservations = seatReservations
        .filter(isPendingReservation)
        .map(toSeatReservationItem);
      this.setData({
        loading: false,
        needLogin: false,
        pendingOrders,
        pendingReservations,
        pendingCount: pendingOrders.length + pendingReservations.length,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },
});
