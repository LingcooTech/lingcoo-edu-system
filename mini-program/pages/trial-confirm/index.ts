import { fetchTrialSession, submitTrialRegistration, type TrialDetail } from '../../services/api';
import { enableShareMenu, shareCard } from '../../utils/share';

type InputEvent = {
  currentTarget: { dataset: { field?: string } };
  detail: { value: string };
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function confirmationKey(sessionId: string) {
  return `trial_session_confirmed:${sessionId}`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

function timeLabel(startsAt: string, endsAt: string) {
  const format = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  return `${format(startsAt)}–${format(endsAt)}`;
}

Page({
  data: {
    loading: true,
    notFound: false,
    submitting: false,
    sessionId: '',
    detail: null as TrialDetail | null,
    coverImageUrl: '',
    organizationName: '',
    dateLabel: '',
    timeLabel: '',
    campusName: '',
    campusAddress: '',
    teacherName: '',
    guardianName: '',
    phone: '',
    studentName: '',
    grade: '',
    confirmed: false,
    full: false,
    error: '',
  },

  onLoad(options: { sessionId?: string; id?: string }) {
    enableShareMenu();
    const sessionId = options.sessionId || options.id || '';
    this.setData({ sessionId });
    void this.load();
  },

  async load() {
    if (!this.data.sessionId) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ loading: true, notFound: false, error: '' });
    try {
      const detail = await fetchTrialSession(this.data.sessionId);
      const session = detail.trialSession;
      this.setData({
        loading: false,
        detail,
        coverImageUrl:
          session.coverImageUrl ||
          session.coverThumbUrl ||
          detail.course.coverImageUrl ||
          detail.course.coverThumbUrl ||
          '',
        organizationName:
          detail.providerInstitution?.name ||
          detail.organization.brandName ||
          detail.organization.name,
        dateLabel: dateLabel(session.startsAt),
        timeLabel: timeLabel(session.startsAt, session.endsAt),
        campusName: detail.campus?.name || '上课地点待确认',
        campusAddress: detail.campus?.address || '',
        teacherName: detail.teacher?.name || '授课老师待确认',
        confirmed: Boolean(wx.getStorageSync(confirmationKey(session.id))),
        full: session.bookedCount >= session.capacity,
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  changeInput(event: InputEvent) {
    const field = String(event.currentTarget.dataset.field || '');
    if (!['guardianName', 'phone', 'studentName', 'grade'].includes(field)) return;
    this.setData({ [field]: event.detail.value, error: '' });
  },

  async submit() {
    if (this.data.submitting || this.data.confirmed || this.data.full) return;
    const guardianName = this.data.guardianName.trim();
    const phone = this.data.phone.trim();
    const studentName = this.data.studentName.trim();
    const grade = this.data.grade.trim();
    if (!guardianName || !phone || !studentName || !grade) {
      this.setData({ error: '请完整填写家长、手机号和孩子信息' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      this.setData({ error: '请输入正确的 11 位手机号' });
      return;
    }
    const detail = this.data.detail;
    if (!detail) return;
    this.setData({ submitting: true, error: '' });
    try {
      await submitTrialRegistration({
        guardianName,
        phone,
        studentName,
        grade,
        trialSessionId: detail.trialSession.id,
        campusId: detail.trialSession.campusId,
        courseId: detail.trialSession.courseId,
        preferredTeacherId: detail.trialSession.teacherId || undefined,
        source: 'teacher_trial_share',
        medium: 'mini_program',
      });
      wx.setStorageSync(confirmationKey(detail.trialSession.id), true);
      this.setData({ confirmed: true });
      wx.showModal({
        title: '预约确认成功',
        content: '感谢确认，请按时上课哦',
        showCancel: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认失败，请稍后再试';
      this.setData({
        error: /full|已满/i.test(message) ? '本次试听名额已满，请联系老师调整时间' : message,
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onShareAppMessage() {
    return shareCard(
      this.data.detail?.trialSession.title || '试听课信息确认',
      `/pages/trial-confirm/index?sessionId=${encodeURIComponent(this.data.sessionId)}`,
      this.data.coverImageUrl,
    );
  },
});
