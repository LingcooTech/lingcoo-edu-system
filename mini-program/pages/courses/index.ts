import {
  fetchCourses,
  fetchPublicInstitutions,
  loadHome,
  type BusinessModelSettings,
  type Course,
  type PublicInstitution,
} from '../../services/api';
import { coursePriceLabel } from '../../utils/format';

type CourseListItem = Course & { priceLabel: string; providerLabel: string };

interface FilterOption {
  label: string;
  value: string;
}

function institutionOptions(institutions: PublicInstitution[]): FilterOption[] {
  return [
    { label: '合作机构', value: '' },
    ...institutions.map((institution) => ({ label: institution.name, value: institution.id })),
  ];
}

function categoryOptions(courses: Course[]): FilterOption[] {
  const categories = Array.from(
    new Set(courses.map((course) => course.category).filter(Boolean)),
  );
  return [
    { label: '分类', value: '' },
    ...categories.map((category) => ({ label: category, value: category })),
  ];
}

function providerName(course: Course, institutions: PublicInstitution[]): string {
  const institution = institutions.find((item) => item.id === course.providerInstitutionId);
  return institution?.name || course.paymentReceiverName || '合作机构待确认';
}

function filterCourses(
  courses: CourseListItem[],
  filter: { institutionId: string; category: string },
): CourseListItem[] {
  return courses.filter((course) => {
    if (filter.institutionId && course.providerInstitutionId !== filter.institutionId) {
      return false;
    }
    if (filter.category && course.category !== filter.category) {
      return false;
    }
    return true;
  });
}

import { enableShareMenu, shareCard, timelineCard } from '../../utils/share';

Page({
  data: {
    loading: true,
    navSolid: false,
    allCourses: [] as CourseListItem[],
    courses: [] as CourseListItem[],
    businessModel: null as BusinessModelSettings | null,
    institutionOptions: [{ label: '合作机构', value: '' }] as FilterOption[],
    categoryOptions: [{ label: '全部分类', value: '' }] as FilterOption[],
    selectedInstitutionIndex: 0,
    selectedCategoryIndex: 0,
  },

  onLoad() {
    enableShareMenu();
    this.load();
  },

  onShareAppMessage() {
    return shareCard('精选活动 · 成长空间', '/pages/courses/index');
  },

  onShareTimeline() {
    return timelineCard('精选活动 · 成长空间', '');
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
      const [courses, institutions, home] = await Promise.all([
        fetchCourses(),
        fetchPublicInstitutions(),
        loadHome().catch(() => null),
      ]);
      const nextInstitutionOptions = institutionOptions(institutions);
      const nextCategoryOptions = categoryOptions(courses);
      const selectedInstitutionIndex = Math.min(
        this.data.selectedInstitutionIndex,
        nextInstitutionOptions.length - 1,
      );
      const selectedCategoryIndex = Math.min(
        this.data.selectedCategoryIndex,
        nextCategoryOptions.length - 1,
      );
      const allCourses = courses.map((course) => ({
        ...course,
        providerLabel: providerName(course, institutions),
        priceLabel: coursePriceLabel(
          course,
          home?.organization.businessModel.onlinePackageSalesEnabled,
        ),
      }));
      this.setData({
        loading: false,
        businessModel: home?.organization.businessModel ?? null,
        allCourses,
        institutionOptions: nextInstitutionOptions,
        categoryOptions: nextCategoryOptions,
        selectedInstitutionIndex,
        selectedCategoryIndex,
        courses: filterCourses(allCourses, {
          institutionId: nextInstitutionOptions[selectedInstitutionIndex]?.value ?? '',
          category: nextCategoryOptions[selectedCategoryIndex]?.value ?? '',
        }),
      });
    } catch (error) {
      this.setData({ loading: false, allCourses: [], courses: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  onInstitutionChange(event: { detail: { value: string } }) {
    const selectedInstitutionIndex = Number(event.detail.value) || 0;
    const institutionOptions = this.data.institutionOptions as FilterOption[];
    const categoryOptions = this.data.categoryOptions as FilterOption[];
    this.setData({
      selectedInstitutionIndex,
      courses: filterCourses(this.data.allCourses as CourseListItem[], {
        institutionId: institutionOptions[selectedInstitutionIndex]?.value ?? '',
        category: categoryOptions[this.data.selectedCategoryIndex]?.value ?? '',
      }),
    });
  },

  onCategoryChange(event: { detail: { value: string } }) {
    const selectedCategoryIndex = Number(event.detail.value) || 0;
    const institutionOptions = this.data.institutionOptions as FilterOption[];
    const categoryOptions = this.data.categoryOptions as FilterOption[];
    this.setData({
      selectedCategoryIndex,
      courses: filterCourses(this.data.allCourses as CourseListItem[], {
        institutionId: institutionOptions[this.data.selectedInstitutionIndex]?.value ?? '',
        category: categoryOptions[selectedCategoryIndex]?.value ?? '',
      }),
    });
  },
});
