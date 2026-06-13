import {
  createParentHomeworkCheckIn,
  createParentUploadToken,
  fetchParentChildren,
  fetchParentHomeworkCheckIns,
  fetchParentLessonAccounts,
  hasToken,
} from '../../services/api';
import {
  buildHomeworkTargets,
  toHomeworkItem,
  toLessonAccountItem,
  type HomeworkItem,
  type HomeworkTarget,
} from '../../utils/parent-center';

const MAX_IMAGES = 9;

Page({
  data: {
    loading: true,
    needLogin: false,
    submitting: false,
    uploading: false,
    targets: [] as HomeworkTarget[],
    targetLabels: [] as string[],
    targetIndex: 0,
    content: '',
    images: [] as string[],
    homeworkCheckIns: [] as HomeworkItem[],
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
      const [lessonAccounts, children, homeworkCheckIns] = await Promise.all([
        fetchParentLessonAccounts(),
        fetchParentChildren(),
        fetchParentHomeworkCheckIns(),
      ]);
      const targets = buildHomeworkTargets(lessonAccounts.map(toLessonAccountItem), children);
      this.setData({
        targets,
        targetLabels: targets.map((target) => target.label),
        targetIndex: this.data.targetIndex >= targets.length ? 0 : this.data.targetIndex,
        homeworkCheckIns: homeworkCheckIns.map(toHomeworkItem),
        needLogin: false,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  async refreshList() {
    try {
      const items = await fetchParentHomeworkCheckIns();
      this.setData({ homeworkCheckIns: items.map(toHomeworkItem) });
    } catch {
      // Keep the existing list if the refresh fails; the submit already succeeded.
    }
  },

  onTargetChange(event: { detail: { value?: string | number } }) {
    const index = Number(event.detail.value ?? 0);
    if (Number.isNaN(index)) return;
    this.setData({ targetIndex: index });
  },

  onContentInput(event: { detail: { value?: string } }) {
    this.setData({ content: event.detail.value || '' });
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
        wx.showToast({
          title: error instanceof Error ? error.message : '图片上传失败',
          icon: 'none',
        });
      }
    }
    wx.hideLoading();
    this.setData({
      images: [...(this.data.images as string[]), ...uploaded],
      uploading: false,
    });
  },

  uploadOne(filePath: string): Promise<string> {
    const filename = filePath.split('/').pop() || 'photo.jpg';
    return createParentUploadToken(filename).then(
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

  onPreviewSubmitted(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
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
    const content = String(this.data.content || '').trim();
    const images = this.data.images as string[];

    if (!target) {
      wx.showToast({ title: '请选择学员', icon: 'none' });
      return;
    }
    if (!content && images.length === 0) {
      wx.showToast({ title: '请填写打卡内容或上传图片', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const result = await createParentHomeworkCheckIn({
        studentId: target.studentId,
        courseId: target.courseId ?? null,
        content,
        imageUrls: images,
      });
      this.setData({ content: '', images: [] });
      await this.refreshList();
      wx.showToast({ title: result.message || '已提交', icon: 'success' });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
