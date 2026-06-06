import {
  fetchPublicInstitutions,
  fetchPublicTeachers,
  type PublicInstitution,
  type PublicTeacher,
} from '../../services/api';

type TeacherCard = PublicTeacher & {
  institutionName?: string;
  institutionLogoUrl?: string | null;
};

Page({
  data: {
    loading: true,
    teachers: [] as TeacherCard[],
    tabs: [] as PublicInstitution[],
    activeTab: '',
    visibleTeachers: [] as TeacherCard[],
  },

  onLoad() {
    this.load();
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [teachers, institutions] = await Promise.all([
        fetchPublicTeachers(),
        fetchPublicInstitutions(),
      ]);
      // Keep backend institution order and only omit empty groups.
      const tabs = institutions.filter((inst) =>
        teachers.some((teacher) => teacher.institutionId === inst.id),
      );
      const institutionById = new Map(
        institutions.map((institution) => [institution.id, institution]),
      );
      const teacherCards = teachers.map((teacher) => {
        const institution = teacher.institutionId
          ? institutionById.get(teacher.institutionId)
          : undefined;
        return {
          ...teacher,
          institutionName: institution?.name,
          institutionLogoUrl: institution?.logoUrl,
        };
      });
      this.setData({ loading: false, teachers: teacherCards, tabs });
      this.applyTab(tabs[0]?.id || '');
    } catch (error) {
      this.setData({ loading: false, teachers: [], tabs: [], visibleTeachers: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  onTabTap(event: { currentTarget: { dataset: { id?: string } } }) {
    this.applyTab(event.currentTarget.dataset.id || '');
  },

  applyTab(activeTab: string) {
    const teachers = this.data.teachers as TeacherCard[];
    const visibleTeachers = !activeTab
      ? teachers
      : teachers.filter((teacher) => teacher.institutionId === activeTab);
    this.setData({ activeTab, visibleTeachers });
  },

  goDetail(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/teacher-detail/index?id=${id}` });
  },
});
