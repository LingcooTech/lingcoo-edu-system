import {
  addTeacherClassStudent,
  fetchTeacherClass,
  fetchTeacherSchedulingOptions,
  removeTeacherClassStudent,
  searchTeacherStudents,
  updateTeacherClass,
  type TeacherClass,
  type TeacherSchedulingOptions,
  type TeacherStudentSearchItem,
} from '../../services/api';

type PickerEvent = { detail: { value: string } };
type InputEvent = { detail: { value: string } };
type TapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };

const STATUS_OPTIONS = [
  { value: 'recruiting' as const, label: '招生中' },
  { value: 'active' as const, label: '开课中' },
  { value: 'paused' as const, label: '暂停' },
  { value: 'completed' as const, label: '已完成' },
];

Page({
  data: {
    classId: '',
    loading: true,
    saving: false,
    memberSavingId: '',
    options: null as TeacherSchedulingOptions | null,
    classGroup: null as TeacherClass | null,
    classroomIndex: 0,
    statusIndex: 0,
    statusOptions: STATUS_OPTIONS,
    name: '',
    capacity: 8,
    keyword: '',
    candidates: [] as TeacherStudentSearchItem[],
    studentLoading: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const classId = String(query.classId || '');
    this.setData({ classId });
    void this.load();
  },

  async load() {
    if (!this.data.classId) {
      this.setData({ loading: false, error: '缺少班级信息' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const [options, payload] = await Promise.all([
        fetchTeacherSchedulingOptions(),
        fetchTeacherClass(this.data.classId),
      ]);
      const classGroup = payload.class;
      const classroomIndex = Math.max(
        options.classrooms.findIndex((item) => item.id === classGroup.classroomId),
        0,
      );
      const statusIndex = Math.max(
        STATUS_OPTIONS.findIndex((item) => item.value === classGroup.status),
        0,
      );
      this.setData({
        options,
        classGroup,
        classroomIndex,
        statusIndex,
        name: classGroup.name,
        capacity: classGroup.capacity,
        loading: false,
      });
      await this.searchCandidates();
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '班级信息加载失败',
      });
    }
  },

  changeName(event: InputEvent) {
    this.setData({ name: event.detail.value });
  },

  changeCapacity(event: InputEvent) {
    this.setData({ capacity: Math.max(1, Math.min(100, Number(event.detail.value) || 1)) });
  },

  changeClassroom(event: PickerEvent) {
    this.setData({ classroomIndex: Number(event.detail.value) });
  },

  changeStatus(event: PickerEvent) {
    this.setData({ statusIndex: Number(event.detail.value) });
  },

  changeKeyword(event: InputEvent) {
    this.setData({ keyword: event.detail.value });
  },

  async saveClass() {
    const options = this.data.options;
    const classGroup = this.data.classGroup;
    const classroom = options?.classrooms[this.data.classroomIndex];
    if (!options || !classGroup || !classroom || !this.data.name.trim()) return;
    if (this.data.capacity < classGroup.students.length) {
      wx.showToast({ title: '容量不能小于当前成员数', icon: 'none' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await updateTeacherClass(classGroup.id, {
        name: this.data.name.trim(),
        classroomId: classroom.id,
        capacity: this.data.capacity,
        status: this.data.statusOptions[this.data.statusIndex].value,
      });
      wx.showToast({ title: '班级已更新', icon: 'success' });
      await this.load();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async searchCandidates() {
    const options = this.data.options;
    const classGroup = this.data.classGroup;
    const courseId = classGroup?.courseId ?? classGroup?.course?.id;
    if (!options || !classGroup || !courseId || !options.permissions.viewAllStudents) return;
    this.setData({ studentLoading: true, error: '' });
    try {
      const result = await searchTeacherStudents({
        search: this.data.keyword,
        courseId,
        page: 1,
        pageSize: 50,
      });
      const memberIds = new Set(
        classGroup.students.map((student: TeacherClass['students'][number]) => student.id),
      );
      this.setData({
        candidates: result.students.filter((student) => !memberIds.has(student.id)),
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '学员加载失败' });
    } finally {
      this.setData({ studentLoading: false });
    }
  },

  async addStudent(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    if (!studentId || this.data.memberSavingId) return;
    this.setData({ memberSavingId: studentId, error: '' });
    try {
      await addTeacherClassStudent(this.data.classId, studentId);
      wx.showToast({ title: '学员已入班', icon: 'success' });
      await this.load();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '添加学员失败' });
    } finally {
      this.setData({ memberSavingId: '' });
    }
  },

  removeStudent(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const name = String(event.currentTarget.dataset.name || '该学员');
    if (!studentId || this.data.memberSavingId) return;
    wx.showModal({
      title: '移出班级',
      content: `确定将${name}移出当前班级吗？已产生的历史课次和点名记录不会受影响。`,
      success: (result) => {
        if (result.confirm) void this.confirmRemoveStudent(studentId);
      },
    });
  },

  async confirmRemoveStudent(studentId: string) {
    this.setData({ memberSavingId: studentId, error: '' });
    try {
      await removeTeacherClassStudent(this.data.classId, studentId);
      wx.showToast({ title: '学员已移出', icon: 'success' });
      await this.load();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '移出学员失败' });
    } finally {
      this.setData({ memberSavingId: '' });
    }
  },
});
