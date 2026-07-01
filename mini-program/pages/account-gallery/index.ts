import {
  createParentStudentWork,
  createParentStudentWorkUploadToken,
  fetchParentChildren,
  fetchParentLessonAccounts,
  fetchParentStudentWorks,
  hasToken,
  type StudentWork,
} from '../../services/api';
import { formatDateTime } from '../../utils/format';
import {
  buildHomeworkTargets,
  toLessonAccountItem,
  type HomeworkTarget,
} from '../../utils/parent-center';

const MAX_IMAGES = 9;

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

const FRAME_OPTIONS = [
  { key: 'classic', label: '经典框' },
  { key: 'gallery', label: '展览框' },
  { key: 'paper', label: '纸张框' },
];

function toGalleryWork(item: StudentWork): GalleryWork {
  return {
    ...item,
    createdAtLabel: formatDateTime(item.createdAt),
    studentName: item.student?.name || '成员',
    courseName: item.course?.name || '活动',
    className: item.class?.name || '',
    teacherName: item.teacher?.name || '',
    sourceLabel: item.source === 'teacher' ? '机构上传' : '家长上传',
    coverUrl: item.imageUrls[0] || '',
    frameClass: `work-frame frame-${item.frameStyle || 'classic'}`,
  };
}

Page({
  data: {
    loading: true,
    needLogin: false,
    submitting: false,
    uploading: false,
    targets: [] as HomeworkTarget[],
    targetLabels: [] as string[],
    targetIndex: 0,
    title: '',
    description: '',
    images: [] as string[],
    works: [] as GalleryWork[],
    frameOptions: FRAME_OPTIONS.map((item) => ({
      ...item,
      className: item.key === 'classic' ? 'frame-option active' : 'frame-option',
    })),
    frameStyle: 'classic' as 'classic' | 'gallery' | 'paper',
    maxImages: MAX_IMAGES,
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
      const [lessonAccounts, children, works] = await Promise.all([
        fetchParentLessonAccounts(),
        fetchParentChildren(),
        fetchParentStudentWorks(),
      ]);
      const targets = buildHomeworkTargets(lessonAccounts.map(toLessonAccountItem), children);
      this.setData({
        targets,
        targetLabels: targets.map((target) => target.label),
        targetIndex: this.data.targetIndex >= targets.length ? 0 : this.data.targetIndex,
        works: works.map(toGalleryWork),
        needLogin: false,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
    }
  },

  onTargetChange(event: { detail: { value?: string | number } }) {
    const index = Number(event.detail.value ?? 0);
    if (!Number.isNaN(index)) {
      this.setData({ targetIndex: index });
    }
  },

  onTitleInput(event: { detail: { value?: string } }) {
    this.setData({ title: event.detail.value || '' });
  },

  onDescriptionInput(event: { detail: { value?: string } }) {
    this.setData({ description: event.detail.value || '' });
  },

  onFrameChange(event: { currentTarget: { dataset: { key?: 'classic' | 'gallery' | 'paper' } } }) {
    const key = event.currentTarget.dataset.key || 'classic';
    this.setData({
      frameStyle: key,
      frameOptions: FRAME_OPTIONS.map((item) => ({
        ...item,
        className: item.key === key ? 'frame-option active' : 'frame-option',
      })),
    });
  },

  onChooseImages() {
    const remaining = MAX_IMAGES - (this.data.images as string[]).length;
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传 ${MAX_IMAGES} 张`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        void this.uploadChosen(result.tempFiles.map((file) => file.tempFilePath));
      },
    });
  },

  async uploadChosen(filePaths: string[]) {
    if (!filePaths.length) return;
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中...', mask: true });
    const uploaded: string[] = [];
    for (const filePath of filePaths) {
      try {
        uploaded.push(await this.uploadOne(filePath));
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '图片上传失败', icon: 'none' });
      }
    }
    wx.hideLoading();
    this.setData({
      images: [...(this.data.images as string[]), ...uploaded],
      uploading: false,
    });
  },

  uploadOne(filePath: string): Promise<string> {
    const filename = filePath.split('/').pop() || 'work.jpg';
    return createParentStudentWorkUploadToken(filename).then(
      (token) =>
        new Promise<string>((resolve, reject) => {
          wx.uploadFile({
            url: token.uploadHost,
            filePath,
            name: 'file',
            formData: { token: token.uploadToken, key: token.key },
            success: (result) => {
              if (result.statusCode >= 200 && result.statusCode < 300) {
                resolve(token.publicUrl);
              } else {
                reject(new Error('图片上传失败'));
              }
            },
            fail: (error) => reject(new Error(error.errMsg || '图片上传失败')),
          });
        }),
    );
  },

  onPreviewImage(event: { currentTarget: { dataset: { index?: number } } }) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.images as string[];
    if (Number.isNaN(index) || !images[index]) return;
    wx.previewImage({ urls: images, current: images[index] });
  },

  onPreviewWork(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },

  onRemoveImage(event: { currentTarget: { dataset: { index?: number } } }) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;
    const images = (this.data.images as string[]).slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  async onSubmit() {
    const targets = this.data.targets as HomeworkTarget[];
    const target = targets[this.data.targetIndex] || targets[0];
    const images = this.data.images as string[];
    const title = String(this.data.title || '').trim();
    const description = String(this.data.description || '').trim();
    if (!target) {
      wx.showToast({ title: '请选择成员', icon: 'none' });
      return;
    }
    if (!images.length) {
      wx.showToast({ title: '请先上传作品图片', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const result = await createParentStudentWork({
        studentId: target.studentId,
        courseId: target.courseId ?? null,
        title: title || '作品展示',
        description,
        imageUrls: images,
        frameStyle: this.data.frameStyle,
      });
      this.setData({ title: '', description: '', images: [] });
      await this.load();
      wx.showToast({ title: result.message || '已发布', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '发布失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
