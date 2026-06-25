import { fetchParentLessonFeedbacks, hasToken } from '../../services/api';
import { toLessonFeedbackItem, type LessonFeedbackItem } from '../../utils/parent-center';

Page({
  data: {
    loading: true,
    needLogin: false,
    lessonFeedbacks: [] as LessonFeedbackItem[],
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
      const lessonFeedbacks = await fetchParentLessonFeedbacks();
      this.setData({
        lessonFeedbacks: lessonFeedbacks.map(toLessonFeedbackItem),
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

  onPreviewImage(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },
});
