import {
  fetchParentChildren,
  fetchParentLessonAccounts,
  hasToken,
  type ParentChild,
} from '../../services/api';
import { toLessonAccountItem, type LessonAccountItem } from '../../utils/parent-center';

Page({
  data: {
    loading: true,
    needLogin: false,
    children: [] as ParentChild[],
    lessonAccounts: [] as LessonAccountItem[],
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
      const [children, lessonAccounts] = await Promise.all([
        fetchParentChildren(),
        fetchParentLessonAccounts(),
      ]);
      this.setData({
        children,
        lessonAccounts: lessonAccounts.map(toLessonAccountItem),
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
});
