import {
  createTeacherTrialInvitation,
  fetchTeacherTrialWorkbench,
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

Page({
  data: {
    loading: true,
    saving: false,
    error: '',
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
  },

  onLoad() {
    enableShareMenu();
    void this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const workbench = await fetchTeacherTrialWorkbench();
      if (!workbench.isAdminTeacher) {
        throw new Error('仅老师、管理员双重身份可创建试听分享卡片');
      }
      if (!workbench.courses.length || !workbench.campuses.length || !workbench.teachers.length) {
        throw new Error('请先配置可用课程、校区和授课老师');
      }
      this.setData({
        workbench,
        loading: false,
        title: `${workbench.courses[0].name}试听预约`,
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
      const result = await createTeacherTrialInvitation({
        courseId: course.id,
        campusId: campus.id,
        teacherId: teacher.id,
        title: this.data.title.trim(),
        startsAt: localDateTime(this.data.date, this.data.startsAt),
        endsAt: localDateTime(this.data.date, this.data.endsAt),
      });
      this.setData({
        created: true,
        sharePath: result.sharePath,
        shareTitle: this.data.title.trim(),
        createdTeacherName: teacher.name,
        createdCourseName: course.name,
        createdCampusName: campus.name,
      });
      wx.showToast({ title: '分享卡片已创建', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '分享卡片创建失败' });
    } finally {
      this.setData({ saving: false });
    }
  },

  createAnother() {
    this.setData({
      created: false,
      sharePath: '',
      shareTitle: '',
      error: '',
    });
  },

  onShareAppMessage() {
    return shareCard(
      this.data.shareTitle || '试听信息确认',
      this.data.sharePath || '/pages/trials/index',
    );
  },
});
