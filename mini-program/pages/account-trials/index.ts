import {
  fetchParentSeatReservations,
  hasToken,
  rescheduleParentSeatReservation,
} from '../../services/api';
import { toSeatReservationItem, type SeatReservationItem } from '../../utils/parent-center';

Page({
  data: {
    loading: true,
    needLogin: false,
    seatReservations: [] as SeatReservationItem[],
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
      const seatReservations = await fetchParentSeatReservations();
      this.setData({
        seatReservations: seatReservations.map(toSeatReservationItem),
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
          await this.load();
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
});
