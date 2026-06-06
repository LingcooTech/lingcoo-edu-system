import { fetchPublicTeacher, type PublicTeacher } from '../../services/api';
import { parseBlocks, type Block } from '../../utils/blocks';

type InstitutionSummary = { id: string; name: string; logoUrl?: string | null };

Page({
  data: {
    loading: true,
    notFound: false,
    teacher: null as PublicTeacher | null,
    institution: null as InstitutionSummary | null,
    bioBlocks: [] as Block[],
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
        bioBlocks: parseBlocks(detail.teacher.bio),
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
