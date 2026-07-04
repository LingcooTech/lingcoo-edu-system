import { fetchPublicTeacher, type Course, type PublicTeacher } from '../../services/api';

type InstitutionSummary = { id: string; name: string; logoUrl?: string | null };
type ProfileSection = {
  key: string;
  label: string;
  text: string;
  lines: string[];
  isList: boolean;
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
    },
    {
      key: 'teachingExperience',
      label: '教学经验',
      text: teacher.teachingExperience ?? '',
    },
    {
      key: 'teachingStyle',
      label: '教学风格',
      text: teacher.teachingStyle ?? '',
    },
    {
      key: 'achievements',
      label: '荣誉奖项 / 代表经历',
      text: teacher.achievements ?? '',
    },
  ]
    .filter((section) => section.text.trim().length > 0)
    .map((section) => {
      const lines = splitLines(section.text);
      return {
        ...section,
        text: lines.join('\n') || section.text.trim(),
        lines,
        isList: lines.length > 1,
      };
    });
}

function buildStats(teacher: PublicTeacher): StatItem[] {
  return [
    { label: '习书时长', value: teacher.practiceDuration ?? '' },
    { label: '教学经验', value: teacher.teachingYears ?? '' },
    { label: '累计学员', value: teacher.studentCount ?? '' },
  ].filter((item) => item.value.trim().length > 0);
}

import {
  configuredShareTitle,
  enableShareMenu,
  shareCard,
  shareTitleWithInstitution,
  timelineCard,
} from '../../utils/share';

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
    const title = shareTitleWithInstitution(
      configuredShareTitle('teacherDetail', (teacher && teacher.name) || '老师'),
      this.data.institution?.name,
    );
    return shareCard(
      title,
      `/pages/teacher-detail/index?id=${(teacher && teacher.id) || ''}`,
      teacher && teacher.avatarUrl,
    );
  },

  onShareTimeline() {
    const teacher = this.data.teacher;
    const title = shareTitleWithInstitution(
      configuredShareTitle('teacherDetail', (teacher && teacher.name) || '老师'),
      this.data.institution?.name,
    );
    return timelineCard(
      title,
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

  previewPhoto(event: { currentTarget: { dataset: { url?: string; type?: string } } }) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;
    const teacher = this.data.teacher as PublicTeacher | null;
    const urls =
      event.currentTarget.dataset.type === 'work'
        ? teacher?.studentWorkUrls ?? []
        : teacher?.classPhotoUrls ?? [];
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] });
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
