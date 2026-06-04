import { fetchPublicTeachers, type PublicTeacher } from '../../services/api';
import { parseBlocks, type Block } from '../../utils/blocks';

type TeacherItem = PublicTeacher & { bioBlocks: Block[] };

Page({
  data: {
    loading: true,
    teachers: [] as TeacherItem[],
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
      const teachers = await fetchPublicTeachers();
      this.setData({
        loading: false,
        teachers: teachers.map((teacher) => ({
          ...teacher,
          bioBlocks: parseBlocks(teacher.bio),
        })),
      });
    } catch (error) {
      this.setData({ loading: false, teachers: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },
});
