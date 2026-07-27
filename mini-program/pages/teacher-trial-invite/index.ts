import {
  createTeacherTrialInvitation,
  fetchTeacherTrialWorkbench,
  updateTeacherTrialSession,
  type TeacherTrialWorkbench,
} from '../../services/api';
import { enableShareMenu, shareCard } from '../../utils/share';

type InputEvent = {
  currentTarget: { dataset: { field?: string } };
  detail: { value: string };
};
type PickerEvent = { detail: { value: string } };

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function timeValue(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

Page({
  data: {
    loading: true,
    saving: false,
    error: '',
    sessionId: '',
    editing: false,
    pageTitle: '添加试听课',
    workbench: null as TeacherTrialWorkbench | null,
    courseIndex: 0,
    campusIndex: 0,
    teacherIndex: 0,
    title: '',
    date: dateValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    startsAt: '16:00',
    endsAt: '17:00',
    created: false,
    sharePath: '',
    shareTitle: '',
    createdTeacherName: '',
    createdCourseName: '',
    createdCampusName: '',
    shareImageUrl: '',
  },

  onLoad(options: { sessionId?: string }) {
    enableShareMenu();
    const sessionId = options.sessionId || '';
    this.setData({
      sessionId,
      editing: Boolean(sessionId),
      pageTitle: sessionId ? '编辑试听课' : '添加试听课',
    });
    void this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const workbench = await fetchTeacherTrialWorkbench();
      if (!workbench.isAdminTeacher) {
        throw new Error('仅老师、管理员双重身份可添加或编辑试听课');
      }
      if (!workbench.courses.length || !workbench.campuses.length || !workbench.teachers.length) {
        throw new Error('请先配置可用课程、校区和授课老师');
      }
      const session = this.data.sessionId
        ? workbench.sessions.find((item) => item.id === this.data.sessionId)
        : null;
      if (this.data.sessionId && !session) {
        throw new Error('试听课不存在或不在当前管理范围内');
      }
      if (session && session.status !== 'scheduled') {
        throw new Error('历史试听仅供查看，不能再修改');
      }
      if (session) {
        const courseIndex = workbench.courses.findIndex((item) => item.id === session.courseId);
        const campusIndex = workbench.campuses.findIndex((item) => item.id === session.campusId);
        const teacherIndex = workbench.teachers.findIndex((item) => item.id === session.teacherId);
        if (courseIndex < 0 || campusIndex < 0 || teacherIndex < 0) {
          throw new Error('该试听课关联的课程、校区或老师已停用，暂时不能修改');
        }
        const course = workbench.courses[courseIndex];
        const campus = workbench.campuses[campusIndex];
        const teacher = workbench.teachers[teacherIndex];
        this.setData({
          workbench,
          loading: false,
          courseIndex,
          campusIndex,
          teacherIndex,
          title: session.title,
          date: dateValue(new Date(session.startsAt)),
          startsAt: timeValue(session.startsAt),
          endsAt: timeValue(session.endsAt),
          sharePath: `/pages/trial-confirm/index?sessionId=${encodeURIComponent(session.id)}`,
          shareTitle: session.title,
          shareImageUrl: session.coverImageUrl || course?.coverImageUrl || '',
          createdTeacherName: teacher?.name || '老师待确认',
          createdCourseName: course?.name || '试听课程',
          createdCampusName: campus?.name || '校区待确认',
        });
        return;
      }
      this.setData({
        workbench,
        loading: false,
        title: `${workbench.courses[0].name}试听预约`,
        shareImageUrl: workbench.courses[0].coverImageUrl || '',
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '试听配置加载失败',
      });
    }
  },

  changeInput(event: InputEvent) {
    const field = String(event.currentTarget.dataset.field || '');
    if (!['title', 'date', 'startsAt', 'endsAt'].includes(field)) return;
    this.setData({ [field]: event.detail.value });
  },

  changeCourse(event: PickerEvent) {
    const courseIndex = Number(event.detail.value) || 0;
    const course = this.data.workbench?.courses[courseIndex];
    this.setData({
      courseIndex,
      title: course ? `${course.name}试听预约` : this.data.title,
      shareImageUrl: course?.coverImageUrl || '',
    });
  },

  changeCampus(event: PickerEvent) {
    this.setData({ campusIndex: Number(event.detail.value) || 0 });
  },

  changeTeacher(event: PickerEvent) {
    this.setData({ teacherIndex: Number(event.detail.value) || 0 });
  },

  async submit() {
    if (this.data.saving) return;
    const workbench = this.data.workbench;
    const course = workbench?.courses[this.data.courseIndex];
    const campus = workbench?.campuses[this.data.campusIndex];
    const teacher = workbench?.teachers[this.data.teacherIndex];
    if (
      !course ||
      !campus ||
      !teacher ||
      !this.data.title.trim() ||
      !this.data.date ||
      !this.data.startsAt ||
      !this.data.endsAt
    ) {
      this.setData({ error: '请完整填写试听课程、老师和确定时间' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      const input = {
        courseId: course.id,
        campusId: campus.id,
        teacherId: teacher.id,
        title: this.data.title.trim(),
        startsAt: localDateTime(this.data.date, this.data.startsAt),
        endsAt: localDateTime(this.data.date, this.data.endsAt),
      };
      const result = this.data.sessionId
        ? await updateTeacherTrialSession(this.data.sessionId, input)
        : await createTeacherTrialInvitation(input);
      this.setData({
        created: true,
        sessionId: result.trialSession.id,
        sharePath: result.sharePath,
        shareTitle: this.data.title.trim(),
        shareImageUrl:
          result.trialSession.coverImageUrl || course.coverImageUrl || this.data.shareImageUrl,
        createdTeacherName: teacher.name,
        createdCourseName: course.name,
        createdCampusName: campus.name,
      });
      wx.showToast({ title: '试听课已保存', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '试听课保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },

  createAnother() {
    this.setData({
      sessionId: '',
      editing: false,
      pageTitle: '添加试听课',
      created: false,
      sharePath: '',
      shareTitle: '',
      error: '',
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return shareCard(
      this.data.shareTitle || '试听信息确认',
      this.data.sharePath || '/pages/trials/index',
      this.data.shareImageUrl,
    );
  },
});
