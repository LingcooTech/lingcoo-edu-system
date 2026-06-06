import {
  fetchPublicInstitutions,
  fetchPublicTeachers,
  type PublicInstitution,
  type PublicTeacher,
} from '../../services/api';

const ALL_TAB = 'all';

Page({
  data: {
    loading: true,
    teachers: [] as PublicTeacher[],
    tabs: [] as PublicInstitution[],
    activeTab: ALL_TAB,
    visibleTeachers: [] as PublicTeacher[],
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
      // Only keep tabs for institutions that actually have teachers; unbound
      // teachers stay visible under「全部」.
      const tabs = institutions.filter((inst) =>
        teachers.some((teacher) => teacher.institutionId === inst.id),
      );
      this.setData({ loading: false, teachers, tabs });
      this.applyTab(ALL_TAB);
    } catch (error) {
      this.setData({ loading: false, teachers: [], tabs: [], visibleTeachers: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  onTabTap(event: { currentTarget: { dataset: { id?: string } } }) {
    this.applyTab(event.currentTarget.dataset.id || ALL_TAB);
  },

  applyTab(activeTab: string) {
    const teachers = this.data.teachers as PublicTeacher[];
    const visibleTeachers =
      activeTab === ALL_TAB
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
