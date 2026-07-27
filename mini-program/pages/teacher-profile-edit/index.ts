import {
  createTeacherUploadToken,
  fetchTeacherProfile,
  updateTeacherProfile,
} from '../../services/api';
import { toUserFacingMessage } from '../../utils/user-facing-message';

type InputEvent = {
  currentTarget: { dataset: { field?: string } };
  detail: { value: string };
};

type GalleryField = 'classPhotoUrls' | 'studentWorkUrls';

type GalleryEvent = {
  currentTarget: {
    dataset: {
      field?: GalleryField;
      index?: number;
      url?: string;
    };
  };
};

const MAX_GALLERY_IMAGES = 24;

Page({
  data: {
    loading: true,
    saving: false,
    avatarUploading: false,
    mediaUploading: false,
    avatarUrl: '',
    wechatQrUrl: '',
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
    practiceDuration: '',
    classPhotoUrls: [] as string[],
    studentWorkUrls: [] as string[],
    parentTestimonialsText: '',
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
        avatarUrl: teacher.avatarUrl || '',
        wechatQrUrl: teacher.wechatQrUrl || '',
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
        practiceDuration: teacher.practiceDuration || '',
        classPhotoUrls: teacher.classPhotoUrls || [],
        studentWorkUrls: teacher.studentWorkUrls || [],
        parentTestimonialsText: (teacher.parentTestimonials || []).join('\n'),
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

  chooseAvatar() {
    if (this.data.avatarUploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const filePath = result.tempFiles[0]?.tempFilePath;
        if (filePath) void this.uploadAvatar(filePath);
      },
    });
  },

  async uploadAvatar(filePath: string) {
    this.setData({ avatarUploading: true, error: '' });
    wx.showLoading({ title: '照片上传中', mask: true });
    try {
      const avatarUrl = await this.uploadOneImage(filePath, 'teacher-avatar.jpg');
      this.setData({ avatarUrl });
      wx.showToast({ title: '照片已上传', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '照片上传失败' });
    } finally {
      wx.hideLoading();
      this.setData({ avatarUploading: false });
    }
  },

  previewAvatar() {
    const avatarUrl = String(this.data.avatarUrl || '');
    if (avatarUrl) wx.previewImage({ current: avatarUrl, urls: [avatarUrl] });
  },

  uploadOneImage(filePath: string, fallbackFilename = 'teacher-profile.jpg'): Promise<string> {
    const filename = filePath.split('/').pop() || fallbackFilename;
    return createTeacherUploadToken(filename).then(
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
                return;
              }
              reject(new Error('图片上传失败'));
            },
            fail: (error) =>
              reject(new Error(toUserFacingMessage(error.errMsg, '图片上传失败'))),
          });
        }),
    );
  },

  chooseWechatQr() {
    if (this.data.mediaUploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const filePath = result.tempFiles[0]?.tempFilePath;
        if (filePath) void this.uploadWechatQr(filePath);
      },
    });
  },

  async uploadWechatQr(filePath: string) {
    this.setData({ mediaUploading: true, error: '' });
    wx.showLoading({ title: '二维码上传中', mask: true });
    try {
      const wechatQrUrl = await this.uploadOneImage(filePath, 'teacher-wechat-qr.jpg');
      this.setData({ wechatQrUrl });
      wx.showToast({ title: '二维码已上传', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '二维码上传失败' });
    } finally {
      wx.hideLoading();
      this.setData({ mediaUploading: false });
    }
  },

  previewWechatQr() {
    const url = String(this.data.wechatQrUrl || '');
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  removeWechatQr() {
    this.setData({ wechatQrUrl: '' });
  },

  chooseGalleryImages(event: GalleryEvent) {
    if (this.data.mediaUploading) return;
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    const current = (this.data[field] as string[]) || [];
    const remaining = MAX_GALLERY_IMAGES - current.length;
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传 ${MAX_GALLERY_IMAGES} 张`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: Math.min(9, remaining),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const filePaths = result.tempFiles.map((file) => file.tempFilePath).filter(Boolean);
        if (filePaths.length) void this.uploadGalleryImages(field, filePaths);
      },
    });
  },

  async uploadGalleryImages(field: GalleryField, filePaths: string[]) {
    this.setData({ mediaUploading: true, error: '' });
    wx.showLoading({ title: '图片上传中', mask: true });
    const uploaded: string[] = [];
    try {
      for (const filePath of filePaths) {
        uploaded.push(await this.uploadOneImage(filePath));
      }
      this.setData({ [field]: [...(this.data[field] as string[]), ...uploaded] });
      wx.showToast({ title: `已上传 ${uploaded.length} 张`, icon: 'success' });
    } catch (error) {
      if (uploaded.length) {
        this.setData({ [field]: [...(this.data[field] as string[]), ...uploaded] });
      }
      this.setData({ error: error instanceof Error ? error.message : '图片上传失败' });
    } finally {
      wx.hideLoading();
      this.setData({ mediaUploading: false });
    }
  },

  previewGalleryImage(event: GalleryEvent) {
    const { field, url } = event.currentTarget.dataset;
    if (!field || !url) return;
    const urls = (this.data[field] as string[]) || [];
    wx.previewImage({ current: url, urls });
  },

  removeGalleryImage(event: GalleryEvent) {
    const { field } = event.currentTarget.dataset;
    const index = Number(event.currentTarget.dataset.index);
    if (!field || Number.isNaN(index)) return;
    const urls = ((this.data[field] as string[]) || []).slice();
    urls.splice(index, 1);
    this.setData({ [field]: urls });
  },

  async submit() {
    if (this.data.saving) return;
    if (this.data.avatarUploading || this.data.mediaUploading) {
      wx.showToast({ title: '请等待图片上传完成', icon: 'none' });
      return;
    }
    if (!this.data.name.trim()) {
      wx.showToast({ title: '请填写老师姓名', icon: 'none' });
      return;
    }
    const specialties = this.data.specialtiesText
      .split(/[、,，\n]/)
      .map((item: string) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
    const parentTestimonials = this.data.parentTestimonialsText
      .split(/\n/)
      .map((item: string) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (parentTestimonials.some((item: string) => item.length > 240)) {
      wx.showToast({ title: '每条家长评价不超过240字', icon: 'none' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await updateTeacherProfile({
        avatarUrl: this.data.avatarUrl,
        name: this.data.name.trim(),
        title: this.data.title.trim(),
        tagline: this.data.tagline.trim(),
        wechatQrUrl: this.data.wechatQrUrl,
        teachingYears: this.data.teachingYears.trim(),
        studentCount: this.data.studentCount.trim(),
        practiceDuration: this.data.practiceDuration.trim(),
        specialties,
        education: this.data.education.trim(),
        teachingExperience: this.data.teachingExperience.trim(),
        teachingStyle: this.data.teachingStyle.trim(),
        teachingPhilosophy: this.data.teachingPhilosophy.trim(),
        achievements: this.data.achievements.trim(),
        bio: this.data.bio.trim(),
        classPhotoUrls: this.data.classPhotoUrls,
        studentWorkUrls: this.data.studentWorkUrls,
        parentTestimonials,
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
