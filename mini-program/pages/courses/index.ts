import { fetchCourses, type Course } from '../../services/api';
import { coursePriceLabel } from '../../utils/format';

type CourseListItem = Course & { priceLabel: string };

Page({
  data: {
    loading: true,
    courses: [] as CourseListItem[],
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
      const courses = await fetchCourses();
      this.setData({
        loading: false,
        courses: courses.map((course) => ({ ...course, priceLabel: coursePriceLabel(course) })),
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
