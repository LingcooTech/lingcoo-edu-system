import {
  fetchCourses,
  fetchTrialSessions,
  loadHome,
  submitTrialRegistration,
  type Course,
  type PublicCampus,
  type PublicTeacher,
  type TrialSession,
} from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { configuredShareTitle, enableShareMenu, shareCard, timelineCard } from '../../utils/share';
import { toUserFacingMessage } from '../../utils/user-facing-message';

type TapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };
type InputEvent = {
  currentTarget: { dataset: Record<string, string | undefined> };
  detail: { value: string };
};
type PickerEvent = { detail: { value: string | number } };
type PhoneWx = typeof wx & {
  makePhoneCall(options: { phoneNumber: string; fail?: () => void }): void;
};

type CourseCard = Course & {
  locationLabel: string;
  coverUrl: string;
};

type PublicTrialCard = TrialSession & {
  startsAtLabel: string;
  courseName: string;
  campusName: string;
};

function preferredConsultant(teachers: PublicTeacher[]) {
  return (
    teachers.find((teacher) => teacher.isPinned && (teacher.wechatQrUrl || teacher.phone)) ??
    teachers.find((teacher) => teacher.wechatQrUrl || teacher.phone) ??
    teachers[0] ??
    null
  );
}

function courseLocation(course: Course, campuses: PublicCampus[]) {
  if (course.teachingLocationLabel?.trim()) return course.teachingLocationLabel.trim();
  if (course.campusId) {
    return campuses.find((campus) => campus.id === course.campusId)?.name || '到店确认';
  }
  return campuses.length === 1 ? campuses[0].name : '提交后确认校区';
}

Page({
  data: {
    loading: true,
    navSolid: false,
    courses: [] as CourseCard[],
    publicTrials: [] as PublicTrialCard[],
    campuses: [] as PublicCampus[],
    consultant: null as PublicTeacher | null,
    showTrialForm: false,
    selectedCourse: null as CourseCard | null,
    campusOptions: [] as Array<{ id: string; label: string }>,
    selectedCampusIndex: 0,
    preferredTeacherId: '',
    source: 'mini_trial_page',
    form: {
      guardianName: '',
      phone: '',
      studentName: '',
      grade: '',
    },
    submitting: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    enableShareMenu();
    this.setData({
      source: query.source || 'mini_trial_page',
      preferredTeacherId: query.teacherId || '',
    });
    void this.load(query.courseId || '');
  },

  onShareAppMessage() {
    return shareCard(
      configuredShareTitle('trials', '预约试听 · 填写孩子资料'),
      '/pages/trials/index',
    );
  },

  onShareTimeline() {
    return timelineCard(configuredShareTitle('trials', '预约试听 · 填写孩子资料'), '');
  },

  async onPullDownRefresh() {
    await this.load('');
    wx.stopPullDownRefresh();
  },

  onPageScroll(event: { scrollTop: number }) {
    const navSolid = event.scrollTop > 24;
    if (navSolid !== this.data.navSolid) this.setData({ navSolid });
  },

  async load(autoCourseId: string) {
    this.setData({ loading: true });
    try {
      const [courses, trialSessions, home] = await Promise.all([
        fetchCourses(),
        fetchTrialSessions(),
        loadHome(),
      ]);
      const campuses = (home.campuses ?? []) as PublicCampus[];
      const courseCards = courses.map((course) => ({
        ...course,
        locationLabel: courseLocation(course, campuses),
        coverUrl: course.coverThumbUrl || course.coverImageUrl || '',
      }));
      const courseById = new Map(courseCards.map((course) => [course.id, course]));
      const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
      this.setData({
        loading: false,
        courses: courseCards,
        campuses,
        consultant: preferredConsultant(home.teachers ?? []),
        publicTrials: trialSessions.map((session) => ({
          ...session,
          startsAtLabel: formatDateTime(session.startsAt),
          courseName: courseById.get(session.courseId)?.name || '公开体验课',
          campusName: campusById.get(session.campusId)?.name || '到店确认',
        })),
      });
      if (autoCourseId) {
        const selected = courseCards.find((course) => course.id === autoCourseId);
        if (selected) this.openCourseForm(selected);
      }
    } catch (error) {
      this.setData({ loading: false, courses: [], publicTrials: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '试听课程加载失败',
        icon: 'none',
      });
    }
  },

  openTrialForm(event: TapEvent) {
    const courseId = String(event.currentTarget.dataset.id || '');
    const selected = (this.data.courses as CourseCard[]).find((course) => course.id === courseId);
    if (selected) this.openCourseForm(selected);
  },

  openCourseForm(course: CourseCard) {
    const campuses = this.data.campuses as PublicCampus[];
    const allowedCampuses = course.campusId
      ? campuses.filter((campus) => campus.id === course.campusId)
      : campuses;
    const campusOptions = allowedCampuses.map((campus) => ({
      id: campus.id,
      label: campus.name,
    }));
    this.setData({
      selectedCourse: course,
      campusOptions,
      selectedCampusIndex: 0,
      preferredTeacherId: this.data.preferredTeacherId || course.defaultTeacherId || '',
      showTrialForm: true,
    });
  },

  closeTrialForm() {
    if (this.data.submitting) return;
    this.setData({ showTrialForm: false });
  },

  noop() {},

  onCampusChange(event: PickerEvent) {
    this.setData({ selectedCampusIndex: Number(event.detail.value) || 0 });
  },

  onFormInput(event: InputEvent) {
    const field = String(event.currentTarget.dataset.field || '');
    if (!['guardianName', 'phone', 'studentName', 'grade'].includes(field)) return;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  async submitTrial() {
    if (this.data.submitting || !this.data.selectedCourse) return;
    const form = this.data.form;
    if (
      !form.guardianName.trim() ||
      !form.phone.trim() ||
      !form.studentName.trim() ||
      !form.grade.trim()
    ) {
      wx.showToast({ title: '请完整填写家长、孩子和手机号', icon: 'none' });
      return;
    }
    const campus = this.data.campusOptions[this.data.selectedCampusIndex];
    this.setData({ submitting: true });
    try {
      const result = await submitTrialRegistration({
        guardianName: form.guardianName.trim(),
        phone: form.phone.trim(),
        studentName: form.studentName.trim(),
        grade: form.grade.trim(),
        campusId: campus?.id,
        courseId: this.data.selectedCourse.id,
        preferredTeacherId: this.data.preferredTeacherId || undefined,
        source: this.data.source,
        medium: 'mini_program',
      });
      this.setData({
        showTrialForm: false,
        form: { guardianName: '', phone: '', studentName: '', grade: '' },
      });
      wx.showModal({
        title: '试听意向已提交',
        content: result.message || '老师会尽快联系您确认试听时间。',
        showCancel: false,
        confirmText: '知道了',
      });
    } catch (error) {
      wx.showToast({
        title: toUserFacingMessage(
          error instanceof Error ? error.message : error,
          '提交失败，请稍后重试',
        ),
        icon: 'none',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  previewConsultantQr() {
    const qr = this.data.consultant?.wechatQrUrl;
    if (!qr) {
      wx.showToast({ title: '老师暂未上传微信二维码', icon: 'none' });
      return;
    }
    wx.previewImage({ current: qr, urls: [qr] });
  },

  callConsultant() {
    const phone = this.data.consultant?.phone?.trim();
    if (!phone) {
      wx.showToast({ title: '老师暂未设置联系电话', icon: 'none' });
      return;
    }
    (wx as PhoneWx).makePhoneCall({
      phoneNumber: phone,
      fail: () => wx.showToast({ title: '未能发起电话', icon: 'none' }),
    });
  },

  openPublicTrial(event: TapEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/trial-detail/index?id=${encodeURIComponent(id)}` });
  },
});
