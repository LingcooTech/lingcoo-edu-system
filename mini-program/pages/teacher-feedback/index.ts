import {
  createTeacherUploadToken,
  fetchTeacherClassSession,
  fetchTeacherHomeworkAssignments,
  fetchTeacherLessonFeedbacks,
  saveTeacherSessionFeedbacks,
  type HomeworkAssignment,
  type TeacherLessonFeedback,
  type TeacherSessionDetail,
  type TeacherSessionDetailRosterStudent,
} from '../../services/api';
import { toUserFacingMessage } from '../../utils/user-facing-message';

type TapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };
type InputEvent = {
  currentTarget: { dataset: Record<string, string | undefined> };
  detail: { value: string };
};

type FeedbackStudentRow = TeacherSessionDetailRosterStudent & {
  content: string;
  rating: number;
  imageUrls: string[];
  assignmentContent: string;
  personalAssignmentEnabled: boolean;
};

const STAR_OPTIONS = [1, 2, 3, 4, 5];
const FEEDBACK_TEMPLATES = [
  '课堂专注，能够认真完成本节课练习。',
  '本节课进步明显，重点内容掌握较好。',
  '课堂参与积极，建议课后继续巩固练习。',
];
const ASSIGNMENT_TEMPLATES = ['复习本次重点', '完成练习一页', '整理本节课学习记录'];
const MAX_IMAGES = 6;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateLabel(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 周${
    '日一二三四五六'[date.getDay()]
  }`;
}

function timeLabel(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(
    end.getMinutes(),
  )}`;
}

Page({
  data: {
    loading: true,
    saving: false,
    saveMode: '' as '' | 'save' | 'notify',
    error: '',
    sessionId: '',
    detail: null as TeacherSessionDetail | null,
    title: '',
    className: '',
    courseName: '',
    teacherName: '',
    classroomName: '',
    dateLabel: '',
    timeLabel: '',
    rows: [] as FeedbackStudentRow[],
    existingFeedbackStudentIds: [] as string[],
    classAssignmentContent: '',
    hasExistingFeedback: false,
    hasExistingAssignments: false,
    starOptions: STAR_OPTIONS,
    feedbackTemplates: FEEDBACK_TEMPLATES,
    assignmentTemplates: ASSIGNMENT_TEMPLATES,
    batchRating: 0,
    uploadingStudentId: '',
  },

  onLoad(options: { sessionId?: string }) {
    this.setData({ sessionId: options.sessionId || '' });
    void this.load();
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    if (!this.data.sessionId) {
      this.setData({ loading: false, error: '缺少课次信息' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const [detail, allFeedbacks, allAssignments] = await Promise.all([
        fetchTeacherClassSession(this.data.sessionId),
        fetchTeacherLessonFeedbacks(),
        fetchTeacherHomeworkAssignments(),
      ]);
      const feedbacks = allFeedbacks.filter((item) => item.classSessionId === this.data.sessionId);
      const assignments = allAssignments.filter(
        (item) => item.classSessionId === this.data.sessionId,
      );
      const feedbackByStudentId = new Map<string, TeacherLessonFeedback>(
        feedbacks.map((item) => [item.studentId, item]),
      );
      const assignmentByStudentId = new Map<string, HomeworkAssignment>(
        assignments.filter((item) => item.studentId).map((item) => [String(item.studentId), item]),
      );
      const classAssignment = assignments.find((item) => !item.studentId)?.content || '';
      const rows: FeedbackStudentRow[] = detail.roster.map((student) => {
        const feedback = feedbackByStudentId.get(student.id);
        const assignment = assignmentByStudentId.get(student.id);
        return {
          ...student,
          content: feedback?.content || '',
          rating: feedback?.rating || 0,
          imageUrls: feedback?.imageUrls || [],
          assignmentContent: assignment?.content || '',
          personalAssignmentEnabled: Boolean(assignment),
        };
      });
      this.setData({
        loading: false,
        detail,
        title: detail.session.topic || detail.course.name,
        className: detail.class?.name || '临时课次',
        courseName: detail.course.name,
        teacherName: detail.session.teacher?.name || '授课老师',
        classroomName: detail.classroom?.name || '上课地点待确认',
        dateLabel: dateLabel(detail.session.startsAt),
        timeLabel: timeLabel(detail.session.startsAt, detail.session.endsAt),
        rows,
        existingFeedbackStudentIds: feedbacks.map((item) => item.studentId),
        classAssignmentContent: classAssignment,
        hasExistingFeedback: feedbacks.length > 0,
        hasExistingAssignments: assignments.length > 0,
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '互动信息加载失败',
      });
    }
  },

  selectRating(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const rating = Number(event.currentTarget.dataset.rating || 0);
    if (!studentId || rating < 1 || rating > 5) return;
    this.patchRow(studentId, { rating });
  },

  applyAllRating(event: TapEvent) {
    const rating = Number(event.currentTarget.dataset.rating || 0);
    if (rating < 1 || rating > 5) return;
    this.setData({
      batchRating: rating,
      rows: (this.data.rows as FeedbackStudentRow[]).map((row) => ({ ...row, rating })),
    });
  },

  applyFeedbackTemplate(event: TapEvent) {
    const value = String(event.currentTarget.dataset.value || '');
    if (!value) return;
    this.setData({
      rows: (this.data.rows as FeedbackStudentRow[]).map((row) => ({
        ...row,
        content: value,
      })),
    });
  },

  updateContent(event: InputEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    if (!studentId) return;
    this.patchRow(studentId, { content: event.detail.value });
  },

  updateClassAssignment(event: { detail: { value: string } }) {
    this.setData({ classAssignmentContent: event.detail.value });
  },

  applyAssignmentTemplate(event: TapEvent) {
    const value = String(event.currentTarget.dataset.value || '');
    if (value) this.setData({ classAssignmentContent: value });
  },

  togglePersonalAssignment(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const row = (this.data.rows as FeedbackStudentRow[]).find((item) => item.id === studentId);
    if (!row) return;
    this.patchRow(studentId, {
      personalAssignmentEnabled: !row.personalAssignmentEnabled,
      ...(!row.personalAssignmentEnabled ? {} : { assignmentContent: '' }),
    });
  },

  updatePersonalAssignment(event: InputEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    if (!studentId) return;
    this.patchRow(studentId, { assignmentContent: event.detail.value });
  },

  patchRow(studentId: string, patch: Partial<FeedbackStudentRow>) {
    this.setData({
      rows: (this.data.rows as FeedbackStudentRow[]).map((row) =>
        row.id === studentId ? { ...row, ...patch } : row,
      ),
    });
  },

  chooseImages(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const row = (this.data.rows as FeedbackStudentRow[]).find((item) => item.id === studentId);
    if (!row) return;
    const remaining = MAX_IMAGES - row.imageUrls.length;
    if (remaining <= 0) {
      wx.showToast({ title: `每位学员最多上传 ${MAX_IMAGES} 张`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        void this.uploadImages(
          studentId,
          result.tempFiles.map((file) => file.tempFilePath),
        );
      },
    });
  },

  async uploadImages(studentId: string, filePaths: string[]) {
    if (!filePaths.length) return;
    this.setData({ uploadingStudentId: studentId });
    wx.showLoading({ title: '上传中...', mask: true });
    const uploaded: string[] = [];
    for (const filePath of filePaths) {
      try {
        uploaded.push(await this.uploadOneImage(filePath));
      } catch (error) {
        wx.showToast({
          title: error instanceof Error ? error.message : '图片上传失败',
          icon: 'none',
        });
      }
    }
    wx.hideLoading();
    const row = (this.data.rows as FeedbackStudentRow[]).find((item) => item.id === studentId);
    if (row) {
      this.patchRow(studentId, {
        imageUrls: [...row.imageUrls, ...uploaded].slice(0, MAX_IMAGES),
      });
    }
    this.setData({ uploadingStudentId: '' });
  },

  uploadOneImage(filePath: string): Promise<string> {
    const filename = filePath.split('/').pop() || 'feedback.jpg';
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
              } else {
                reject(new Error('图片上传失败'));
              }
            },
            fail: (error) => reject(new Error(toUserFacingMessage(error.errMsg, '图片上传失败'))),
          });
        }),
    );
  },

  previewImage(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const url = String(event.currentTarget.dataset.url || '');
    const row = (this.data.rows as FeedbackStudentRow[]).find((item) => item.id === studentId);
    if (row && url) wx.previewImage({ urls: row.imageUrls, current: url });
  },

  removeImage(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const index = Number(event.currentTarget.dataset.index);
    const row = (this.data.rows as FeedbackStudentRow[]).find((item) => item.id === studentId);
    if (!row || Number.isNaN(index)) return;
    const imageUrls = row.imageUrls.slice();
    imageUrls.splice(index, 1);
    this.patchRow(studentId, { imageUrls });
  },

  saveDraft() {
    void this.submit(false);
  },

  saveAndNotify() {
    void this.submit(true);
  },

  async submit(notifyGuardians: boolean) {
    if (this.data.saving || !this.data.sessionId) return;
    const rows = this.data.rows as FeedbackStudentRow[];
    const items = rows
      .map((row) => ({
        studentId: row.id,
        content: row.content.trim(),
        rating: Number(row.rating || 0),
        imageUrls: row.imageUrls,
      }))
      .filter((item) => item.content || item.rating > 0 || item.imageUrls.length);
    const studentAssignments = rows
      .filter((row) => row.personalAssignmentEnabled)
      .map((row) => ({ studentId: row.id, content: row.assignmentContent.trim() }));
    const classAssignmentContent = this.data.classAssignmentContent.trim();
    const savedStudentIds = new Set(items.map((item) => item.studentId));
    const removedStudentIds = (this.data.existingFeedbackStudentIds as string[]).filter(
      (studentId) => !savedStudentIds.has(studentId),
    );
    if (
      !items.length &&
      !classAssignmentContent &&
      !studentAssignments.some((item) => item.content) &&
      !removedStudentIds.length &&
      !this.data.hasExistingAssignments
    ) {
      this.setData({ error: '请至少填写一项课堂互动或课后任务' });
      return;
    }
    this.setData({ saving: true, saveMode: notifyGuardians ? 'notify' : 'save', error: '' });
    try {
      await saveTeacherSessionFeedbacks(this.data.sessionId, {
        items,
        classAssignmentContent,
        studentAssignments,
        notifyGuardians,
        removedStudentIds,
      });
      this.setData({ hasExistingFeedback: true });
      wx.showToast({
        title: notifyGuardians ? '已保存并通知家长' : '互动已保存',
        icon: 'success',
      });
      await this.load();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '互动保存失败' });
    } finally {
      this.setData({ saving: false, saveMode: '' });
    }
  },
});
