import {
  createTeacherClass,
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
  balanceLabel: string;
};

const STATUS_OPTIONS = [
  { value: 'recruiting' as const, label: '招生中' },
  { value: 'active' as const, label: '开课中' },
];

Page({
  data: {
    loading: true,
    saving: false,
    options: null as TeacherSchedulingOptions | null,
    courseIndex: 0,
    classroomIndex: 0,
    statusIndex: 0,
    statusOptions: STATUS_OPTIONS,
    name: '',
    capacity: 8,
    keyword: '',
    studentLoading: false,
    students: [] as StudentRow[],
    selectedCount: 0,
    totalStudents: 0,
    error: '',
  },

  onLoad() {
    void this.loadOptions();
  },

  async loadOptions() {
    this.setData({ loading: true, error: '' });
    try {
      const options = await fetchTeacherSchedulingOptions();
      if (!options.permissions.manageClasses) {
        throw new Error('当前账号尚未开通新建班级权限');
      }
      if (options.courses.length === 0 || options.classrooms.length === 0) {
        throw new Error('请先由管理员配置已发布课程和可用教室');
      }
      const firstCourse = options.courses[0];
      const classroomIndex = Math.max(
        options.classrooms.findIndex((item) => item.id === firstCourse.classroomId),
        0,
      );
      this.setData({
        options,
        classroomIndex,
        name: firstCourse.name,
        loading: false,
      });
      await this.loadStudents();
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '建班信息加载失败',
      });
    }
  },

  currentCourseId() {
    return this.data.options?.courses[this.data.courseIndex]?.id ?? '';
  },

  async changeCourse(event: PickerEvent) {
    const courseIndex = Number(event.detail.value);
    const course = this.data.options?.courses[courseIndex];
    this.setData({
      courseIndex,
      name: course?.name ?? '',
      students: [],
      selectedCount: 0,
    });
    await this.loadStudents();
  },

  changeClassroom(event: PickerEvent) {
    this.setData({ classroomIndex: Number(event.detail.value) });
  },

  changeStatus(event: PickerEvent) {
    this.setData({ statusIndex: Number(event.detail.value) });
  },

  changeName(event: InputEvent) {
    this.setData({ name: event.detail.value });
  },

  changeCapacity(event: InputEvent) {
    const capacity = Math.max(1, Math.min(100, Number(event.detail.value) || 1));
    this.setData({ capacity });
  },

  changeKeyword(event: InputEvent) {
    this.setData({ keyword: event.detail.value });
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
      const previous = new Set(
        (this.data.students as StudentRow[])
          .filter((student) => student.selected)
          .map((student) => student.id),
      );
      const students = result.students.map((student) => ({
        ...student,
        selected: previous.has(student.id),
        balanceLabel: String(
          student.lessonAccounts.find((account) => account.courseId === courseId)?.balance ?? '-',
        ),
      }));
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
    const students = (this.data.students as StudentRow[]).map((student) => {
      if (student.id !== id) return student;
      if (!student.selected && this.data.selectedCount >= this.data.capacity) {
        wx.showToast({ title: '已达到班级容量', icon: 'none' });
        return student;
      }
      return { ...student, selected: !student.selected };
    });
    this.setData({
      students,
      selectedCount: students.filter((student) => student.selected).length,
    });
  },

  async submit() {
    if (this.data.saving) return;
    const options = this.data.options;
    if (!options) return;
    const course = options.courses[this.data.courseIndex];
    const classroom = options.classrooms[this.data.classroomIndex];
    const selected = (this.data.students as StudentRow[]).filter((student) => student.selected);
    if (!course || !classroom || !this.data.name.trim()) {
      wx.showToast({ title: '请完整填写班级信息', icon: 'none' });
      return;
    }
    if (selected.length > this.data.capacity) {
      wx.showToast({ title: '学员人数超过班级容量', icon: 'none' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await createTeacherClass({
        courseId: course.id,
        classroomId: classroom.id,
        name: this.data.name.trim(),
        capacity: this.data.capacity,
        status: this.data.statusOptions[this.data.statusIndex].value,
        studentIds: selected.map((student) => student.id),
      });
      wx.showToast({ title: '班级已创建', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '创建班级失败' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
