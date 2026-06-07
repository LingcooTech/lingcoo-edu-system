import { fetchCourses, loadHome, type BusinessModelSettings, type Course } from '../../services/api';
import { coursePriceLabel } from '../../utils/format';

type CourseListItem = Course & { priceLabel: string };

Page({
  data: {
    loading: true,
    courses: [] as CourseListItem[],
    businessModel: null as BusinessModelSettings | null,
  },

  onLoad() {
    this.load();
  },

  async onPullDownRefresh() {
    await this.load();
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
          priceLabel: coursePriceLabel(course, home?.organization.businessModel.mode),
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
