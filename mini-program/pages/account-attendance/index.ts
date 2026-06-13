import {
  fetchParentAttendance,
  fetchParentCheckInSessions,
  hasToken,
  submitParentCheckIn,
} from '../../services/api';
import {
  toAttendanceItem,
  toCheckInItem,
  type AttendanceItem,
  type CheckInItem,
} from '../../utils/parent-center';

Page({
  data: {
    loading: true,
    needLogin: false,
    checkingInKey: '',
    checkInSessions: [] as CheckInItem[],
    attendance: [] as AttendanceItem[],
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
      const [checkInSessions, attendance] = await Promise.all([
        fetchParentCheckInSessions(),
        fetchParentAttendance(),
      ]);
      this.setData({
        checkInSessions: checkInSessions.map(toCheckInItem),
        attendance: attendance.map(toAttendanceItem),
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

  async onParentCheckIn(event: {
    currentTarget: { dataset: { sessionId?: string; studentId?: string; key?: string } };
  }) {
    const { sessionId, studentId, key } = event.currentTarget.dataset;
    if (!sessionId || !studentId || !key) return;
    this.setData({ checkingInKey: key });
    try {
      const result = await submitParentCheckIn(sessionId, studentId);
      await this.load();
      wx.showToast({ title: result.message || '签到成功', icon: 'success' });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '签到失败',
        icon: 'none',
      });
    } finally {
      this.setData({ checkingInKey: '' });
    }
  },
});
