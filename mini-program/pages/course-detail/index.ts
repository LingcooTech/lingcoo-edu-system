import {
  fetchCourse,
  submitTrialRegistration,
  type Course,
  type CoursePackage,
} from '../../services/api';
import { money } from '../../utils/format';
import { parseBlocks, type Block } from '../../utils/blocks';

type PackageItem = CoursePackage & { priceLabel: string };

Page({
  data: {
    loading: true,
    notFound: false,
    course: null as Course | null,
    packages: [] as PackageItem[],
    contentBlocks: [] as Block[],
    showTrialForm: false,
    submittingTrial: false,
  },

  onLoad(options: { slug?: string }) {
    this.load(options.slug || '');
  },

  async load(slug: string) {
    if (!slug) {
      this.setData({ loading: false, notFound: true });
      return;
    }

    this.setData({ loading: true, notFound: false });
    try {
      const payload = await fetchCourse(slug);
      wx.setNavigationBarTitle({ title: payload.course.name });
      this.setData({
        loading: false,
        course: payload.course,
        packages: payload.coursePackages.map((item) => ({ ...item, priceLabel: money(item.priceAmount) })),
        contentBlocks: parseBlocks(payload.course.content),
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  goCourses() {
    wx.navigateTo({ url: '/pages/courses/index' });
  },

  onTrialTap() {
    this.setData({ showTrialForm: true });
  },

  onBuyTap() {
    wx.showToast({ title: '小程序支付接入中', icon: 'none' });
  },

  async onTrialSubmit(event: {
    detail: {
      value: {
        guardianName?: string;
        phone?: string;
        studentName?: string;
        grade?: string;
      };
    };
  }) {
    const course = this.data.course;
    if (!course) return;
    const value = event.detail.value;
    const guardianName = (value.guardianName || '').trim();
    const phone = (value.phone || '').trim();
    const studentName = (value.studentName || '').trim();
    const grade = (value.grade || '').trim();

    if (!guardianName || !phone || !studentName || !grade) {
      wx.showToast({ title: '请补全报名信息', icon: 'none' });
      return;
    }

    this.setData({ submittingTrial: true });
    try {
      await submitTrialRegistration({
        guardianName,
        phone,
        studentName,
        grade,
        courseId: course.id,
        source: 'mini_program',
        course: course.slug,
        medium: 'wechat_mini_program',
      });
      wx.showModal({
        title: '提交成功',
        content: '老师会尽快联系确认试听时间。',
        showCancel: false,
        success: () => {
          this.setData({ showTrialForm: false });
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      });
    } finally {
      this.setData({ submittingTrial: false });
    }
  },
});
