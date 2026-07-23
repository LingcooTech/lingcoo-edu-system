import {
  createTeacherClassSession,
  fetchTeacherSchedulingOptions,
  searchTeacherStudents,
  type TeacherSchedulingOptions,
  type TeacherStudentSearchItem,
} from '../../services/api';

type PickerEvent = { detail: { value: string } };
type InputEvent = { detail: { value: string } };
type TapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };

type StudentRow = TeacherStudentSearchItem & {
  selected: boolean;
  enrollmentMode: 'class' | 'session_only';
  balanceLabel: string;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function defaultTime() {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return {
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
}

function toIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

Page({
  data: {
    loading: true,
    saving: false,
    options: null as TeacherSchedulingOptions | null,
    modeOptions: [] as Array<{ key: 'class' | 'ad_hoc'; label: string }>,
    modeIndex: 0,
    classIndex: 0,
    courseIndex: 0,
    classroomIndex: 0,
    date: defaultTime().date,
    startTime: defaultTime().startTime,
    endTime: defaultTime().endTime,
    topic: '',
    lessonUnits: 1,
    keyword: '',
    studentLoading: false,
    students: [] as StudentRow[],
    selectedCount: 0,
    totalStudents: 0,
    error: '',
  },

  onLoad() {
    this.loadOptions();
  },

  async loadOptions() {
    this.setData({ loading: true, error: '' });
    try {
      const options = await fetchTeacherSchedulingOptions();
      const modeOptions: Array<{ key: 'class' | 'ad_hoc'; label: string }> = [];
      if (options.permissions.createClassSession && options.classes.length > 0) {
        modeOptions.push({ key: 'class', label: '正式班级课次' });
      }
      if (options.permissions.createAdHocSession) {
        modeOptions.push({ key: 'ad_hoc', label: '临时课次' });
      }
      if (modeOptions.length === 0) {
        throw new Error('当前账号尚未开通排课权限');
      }
      this.setData({ options, modeOptions, loading: false });
      this.applyModeDefaults();
      await this.loadStudents();
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '排课信息加载失败',
      });
    }
  },

  currentMode(): 'class' | 'ad_hoc' {
    return this.data.modeOptions[this.data.modeIndex]?.key ?? 'class';
  },

  currentCourseId() {
    const options = this.data.options;
    if (!options) return '';
    if (this.currentMode() === 'class') {
      return options.classes[this.data.classIndex]?.courseId ?? '';
    }
    return options.courses[this.data.courseIndex]?.id ?? '';
  },

  applyModeDefaults() {
    const options = this.data.options;
    if (!options) return;
    if (this.currentMode() === 'class') {
      const classGroup = options.classes[this.data.classIndex];
      const classroomIndex = Math.max(
        options.classrooms.findIndex(
          (item: TeacherSchedulingOptions['classrooms'][number]) =>
            item.id === classGroup?.classroomId,
        ),
        0,
      );
      this.setData({ classroomIndex, topic: classGroup?.course?.name ?? classGroup?.name ?? '' });
    } else {
      this.setData({ topic: options.courses[this.data.courseIndex]?.name ?? '' });
    }
  },

  async changeMode(event: PickerEvent) {
    this.setData({ modeIndex: Number(event.detail.value), students: [], selectedCount: 0 });
    this.applyModeDefaults();
    await this.loadStudents();
  },

  async changeClass(event: PickerEvent) {
    this.setData({ classIndex: Number(event.detail.value), students: [], selectedCount: 0 });
    this.applyModeDefaults();
    await this.loadStudents();
  },

  async changeCourse(event: PickerEvent) {
    this.setData({ courseIndex: Number(event.detail.value), students: [], selectedCount: 0 });
    this.applyModeDefaults();
    await this.loadStudents();
  },

  changeClassroom(event: PickerEvent) {
    this.setData({ classroomIndex: Number(event.detail.value) });
  },

  changeDate(event: PickerEvent) {
    this.setData({ date: event.detail.value });
  },

  changeStartTime(event: PickerEvent) {
    this.setData({ startTime: event.detail.value });
  },

  changeEndTime(event: PickerEvent) {
    this.setData({ endTime: event.detail.value });
  },

  changeTopic(event: InputEvent) {
    this.setData({ topic: event.detail.value });
  },

  changeKeyword(event: InputEvent) {
    this.setData({ keyword: event.detail.value });
  },

  decreaseUnits() {
    this.setData({ lessonUnits: Math.max(0, this.data.lessonUnits - 1) });
  },

  increaseUnits() {
    this.setData({ lessonUnits: Math.min(10, this.data.lessonUnits + 1) });
  },

  async loadStudents() {
    const options = this.data.options;
    const courseId = this.currentCourseId();
    if (!options || !courseId || !options.permissions.viewAllStudents) return;
    this.setData({ studentLoading: true, error: '' });
    try {
      const result = await searchTeacherStudents({
        search: this.data.keyword,
        courseId,
        page: 1,
        pageSize: 50,
      });
      const previous = new Map(
        (this.data.students as StudentRow[])
          .filter((student) => student.selected)
          .map((student) => [student.id, student]),
      );
      const students = result.students.map((student) => {
        const selected = previous.get(student.id);
        const balance = student.lessonAccounts.find((item) => item.courseId === courseId)?.balance;
        return {
          ...student,
          selected: Boolean(selected),
          enrollmentMode: selected?.enrollmentMode ?? 'session_only',
          balanceLabel: balance === undefined ? '-' : String(balance),
        } as StudentRow;
      });
      this.setData({
        students,
        totalStudents: result.total,
        selectedCount: students.filter((student) => student.selected).length,
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '学员加载失败' });
    } finally {
      this.setData({ studentLoading: false });
    }
  },

  toggleStudent(event: TapEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    const students = (this.data.students as StudentRow[]).map((student) =>
      student.id === id ? { ...student, selected: !student.selected } : student,
    );
    this.setData({
      students,
      selectedCount: students.filter((student) => student.selected).length,
    });
  },

  toggleEnrollmentMode(event: TapEvent) {
    if (this.currentMode() !== 'class') return;
    const id = String(event.currentTarget.dataset.id || '');
    const students = (this.data.students as StudentRow[]).map((student) =>
      student.id === id
        ? {
            ...student,
            enrollmentMode:
              student.enrollmentMode === 'class' ? ('session_only' as const) : ('class' as const),
          }
        : student,
    );
    this.setData({ students });
  },

  async submit() {
    if (this.data.saving) return;
    const options = this.data.options;
    if (!options) return;
    const courseId = this.currentCourseId();
    const classroom = options.classrooms[this.data.classroomIndex];
    const selected = (this.data.students as StudentRow[]).filter((student) => student.selected);
    if (!courseId || !classroom || !this.data.topic.trim()) {
      wx.showToast({ title: '请完整填写课程信息', icon: 'none' });
      return;
    }
    if (selected.length === 0) {
      wx.showToast({ title: '请至少选择一名学员', icon: 'none' });
      return;
    }
    const startsAt = toIso(this.data.date, this.data.startTime);
    const endsAt = toIso(this.data.date, this.data.endTime);
    if (new Date(endsAt) <= new Date(startsAt)) {
      wx.showToast({ title: '下课时间必须晚于上课时间', icon: 'none' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await createTeacherClassSession({
        classId:
          this.currentMode() === 'class'
            ? (options.classes[this.data.classIndex]?.id ?? null)
            : null,
        courseId,
        classroomId: classroom.id,
        startsAt,
        endsAt,
        topic: this.data.topic.trim(),
        lessonUnits: this.data.lessonUnits,
        students: selected.map((student) => ({
          studentId: student.id,
          enrollmentMode: this.currentMode() === 'class' ? student.enrollmentMode : 'session_only',
        })),
      });
      wx.showToast({ title: '课次已添加', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '排课失败' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
