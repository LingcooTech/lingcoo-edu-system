import { fetchPublicTeacher, type PublicTeacher } from '../../services/api';

type InstitutionSummary = { id: string; name: string; logoUrl?: string | null };
type ProfileSection = {
  key: string;
  label: string;
  text: string;
  tone: 'plain' | 'quote' | 'list';
  lines: string[];
};

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

Page({
  data: {
    loading: true,
    notFound: false,
    teacher: null as PublicTeacher | null,
    institution: null as InstitutionSummary | null,
    profileSections: [] as ProfileSection[],
  },

  onLoad(options: { id?: string }) {
    this.load(options.id || '');
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
});
