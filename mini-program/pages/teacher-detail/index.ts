import { fetchPublicTeacher, type Course, type PublicTeacher } from '../../services/api';

type InstitutionSummary = { id: string; name: string; logoUrl?: string | null };
type ProfileSection = {
  key: string;
  label: string;
  text: string;
  tone: 'plain' | 'quote' | 'list';
  lines: string[];
};
type StatItem = { label: string; value: string };

function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*、\d.]+/, '').trim())
    .filter(Boolean);
}

function buildProfileSections(teacher: PublicTeacher): ProfileSection[] {
  return [
    {
      key: 'education',
      label: '毕业院校 / 专业背景',
      text: teacher.education ?? '',
      tone: 'plain' as const,
    },
    {
      key: 'teachingExperience',
      label: '教学经验',
      text: teacher.teachingExperience ?? '',
      tone: 'plain' as const,
    },
    {
      key: 'teachingStyle',
      label: '教学风格',
      text: teacher.teachingStyle ?? '',
      tone: 'quote' as const,
    },
    {
      key: 'achievements',
      label: '荣誉奖项 / 代表经历',
      text: teacher.achievements ?? '',
      tone: 'list' as const,
    },
  ]
    .filter((section) => section.text.trim().length > 0)
    .map((section) => ({ ...section, lines: splitLines(section.text) }));
}

function buildStats(teacher: PublicTeacher): StatItem[] {
  return [
    { label: '教学经验', value: teacher.teachingYears ?? '' },
    { label: '累计学员', value: teacher.studentCount ?? '' },
    { label: '续班率', value: teacher.retentionRate ?? '' },
  ].filter((item) => item.value.trim().length > 0);
}

import { enableShareMenu, shareCard, timelineCard } from '../../utils/share';

Page({
  data: {
    loading: true,
    notFound: false,
    teacher: null as PublicTeacher | null,
    institution: null as InstitutionSummary | null,
    courses: [] as Course[],
    statItems: [] as StatItem[],
    profileSections: [] as ProfileSection[],
    coursePickerVisible: false,
  },

  onLoad(options: { id?: string }) {
    enableShareMenu();
    this.load(options.id || '');
  },

  onShareAppMessage() {
    const teacher = this.data.teacher;
    return shareCard(
      (teacher && teacher.name) || '老师',
      `/pages/teacher-detail/index?id=${(teacher && teacher.id) || ''}`,
      teacher && teacher.avatarUrl,
    );
  },

  onShareTimeline() {
    const teacher = this.data.teacher;
    return timelineCard(
      (teacher && teacher.name) || '老师',
      `id=${(teacher && teacher.id) || ''}`,
      teacher && teacher.avatarUrl,
    );
  },

  async load(id: string) {
    if (!id) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ loading: true, notFound: false });
    try {
      const detail = await fetchPublicTeacher(id);
      wx.setNavigationBarTitle({ title: detail.teacher.name });
      this.setData({
        loading: false,
        teacher: detail.teacher,
        institution: detail.institution,
        courses: detail.courses,
        statItems: buildStats(detail.teacher),
        profileSections: buildProfileSections(detail.teacher),
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  goTeachers() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({ url: '/pages/teachers/index' });
      },
    });
  },

  previewQr() {
    const teacher = this.data.teacher as PublicTeacher | null;
    if (teacher?.wechatQrUrl) {
      wx.previewImage({ urls: [teacher.wechatQrUrl] });
    }
  },

  goCourses() {
    const courses = this.data.courses as Course[];
    if (courses.length === 1 && courses[0]?.slug) {
      wx.navigateTo({
        url: `/pages/course-detail/index?slug=${encodeURIComponent(courses[0].slug)}`,
      });
      return;
    }
    if (courses.length > 1) {
      this.setData({ coursePickerVisible: true });
      return;
    }
    wx.switchTab({ url: '/pages/courses/index' });
  },

  closeCoursePicker() {
    this.setData({ coursePickerVisible: false });
  },

  noop() {},

  onCourseChoiceTap(event: { currentTarget: { dataset: { slug?: string } } }) {
    const slug = event.currentTarget.dataset.slug;
    if (!slug) return;
    this.setData({ coursePickerVisible: false });
    wx.navigateTo({
      url: `/pages/course-detail/index?slug=${encodeURIComponent(slug)}`,
    });
  },
});
