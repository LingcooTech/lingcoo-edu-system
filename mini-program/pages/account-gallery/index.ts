import { fetchParentStudentWorks, hasToken, type StudentWork } from '../../services/api';
import { formatDateTime } from '../../utils/format';

type GalleryWork = StudentWork & {
  createdAtLabel: string;
  studentName: string;
  courseName: string;
  className: string;
  teacherName: string;
  sourceLabel: string;
  coverUrl: string;
  frameClass: string;
};

function toGalleryWork(item: StudentWork): GalleryWork {
  return {
    ...item,
    createdAtLabel: formatDateTime(item.createdAt),
    studentName: item.student?.name || '成员',
    courseName: item.course?.name || '课程',
    className: item.class?.name || '',
    teacherName: item.teacher?.name || '',
    sourceLabel: item.source === 'teacher' ? '机构上传' : '后台精选',
    coverUrl: item.imageUrls[0] || '',
    frameClass: `work-frame frame-${item.frameStyle || 'classic'}`,
  };
}

Page({
  data: {
    loading: true,
    needLogin: false,
    works: [] as GalleryWork[],
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  goLogin() {
    wx.switchTab({ url: '/pages/account/index' });
  },

  async load() {
    if (!hasToken()) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const works = await fetchParentStudentWorks();
      this.setData({
        works: works.filter((item) => item.status === 'published').map(toGalleryWork),
        needLogin: false,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
    }
  },

  onPreviewWork(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },
});
