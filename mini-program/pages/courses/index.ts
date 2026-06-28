import {
  fetchCourses,
  loadHome,
  type BusinessModelSettings,
  type Course,
} from '../../services/api';
import { coursePriceLabel } from '../../utils/format';

type CourseListItem = Course & { priceLabel: string };

import { shareCard, timelineCard } from '../../utils/share';

Page({
  data: {
    loading: true,
    navSolid: false,
    courses: [] as CourseListItem[],
    businessModel: null as BusinessModelSettings | null,
  },

  onLoad() {
    this.load();
  },

  onShareAppMessage() {
    return shareCard('精选课程 · 成长教室', '/pages/courses/index');
  },

  onShareTimeline() {
    return timelineCard('精选课程 · 成长教室', '');
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  onPageScroll(event: { scrollTop: number }) {
    const navSolid = event.scrollTop > 24;
    if (navSolid !== this.data.navSolid) {
      this.setData({ navSolid });
    }
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [courses, home] = await Promise.all([fetchCourses(), loadHome().catch(() => null)]);
      this.setData({
        loading: false,
        businessModel: home?.organization.businessModel ?? null,
        courses: courses.map((course) => ({
          ...course,
          priceLabel: coursePriceLabel(
            course,
            home?.organization.businessModel.onlinePackageSalesEnabled,
          ),
        })),
      });
    } catch (error) {
      this.setData({ loading: false, courses: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },
});
