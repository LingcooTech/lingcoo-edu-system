import { fetchTeacherProfile, updateTeacherProfile } from '../../services/api';

type InputEvent = {
  currentTarget: { dataset: { field?: string } };
  detail: { value: string };
};

Page({
  data: {
    loading: true,
    saving: false,
    name: '',
    title: '',
    tagline: '',
    teachingYears: '',
    studentCount: '',
    specialtiesText: '',
    education: '',
    teachingExperience: '',
    teachingStyle: '',
    teachingPhilosophy: '',
    achievements: '',
    bio: '',
    error: '',
  },

  onLoad() {
    void this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const { teacher } = await fetchTeacherProfile();
      this.setData({
        name: teacher.name || '',
        title: teacher.title || '',
        tagline: teacher.tagline || '',
        teachingYears: teacher.teachingYears || '',
        studentCount: teacher.studentCount || '',
        specialtiesText: (teacher.specialties || []).join('、'),
        education: teacher.education || '',
        teachingExperience: teacher.teachingExperience || '',
        teachingStyle: teacher.teachingStyle || '',
        teachingPhilosophy: teacher.teachingPhilosophy || '',
        achievements: teacher.achievements || '',
        bio: teacher.bio || '',
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '资料加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  changeField(event: InputEvent) {
    const field = String(event.currentTarget.dataset.field || '');
    if (!field) return;
    this.setData({ [field]: event.detail.value });
  },

  async submit() {
    if (this.data.saving) return;
    if (!this.data.name.trim()) {
      wx.showToast({ title: '请填写老师姓名', icon: 'none' });
      return;
    }
    const specialties = this.data.specialtiesText
      .split(/[、,，\n]/)
      .map((item: string) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
    this.setData({ saving: true, error: '' });
    try {
      await updateTeacherProfile({
        name: this.data.name.trim(),
        title: this.data.title.trim(),
        tagline: this.data.tagline.trim(),
        teachingYears: this.data.teachingYears.trim(),
        studentCount: this.data.studentCount.trim(),
        specialties,
        education: this.data.education.trim(),
        teachingExperience: this.data.teachingExperience.trim(),
        teachingStyle: this.data.teachingStyle.trim(),
        teachingPhilosophy: this.data.teachingPhilosophy.trim(),
        achievements: this.data.achievements.trim(),
        bio: this.data.bio.trim(),
      });
      wx.showToast({ title: '个人介绍已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
