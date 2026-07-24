import {
  addTeacherClassStudent,
  fetchTeacherCalendar,
  fetchTeacherCapabilities,
  fetchTeacherClass,
  fetchTeacherSchedulingOptions,
  fetchTeacherSessionAttendance,
  recordTeacherAttendance,
  removeTeacherClassStudent,
  searchTeacherStudents,
  updateTeacherClass,
  type AttendanceStatus,
  type SessionAttendanceRecord,
  type TeacherCalendarEvent,
  type TeacherClass,
  type TeacherRosterStudent,
  type TeacherSchedulingOptions,
  type TeacherStudentSearchItem,
} from '../../services/api';

type ClassTab = 'schedule' | 'students' | 'attendance';
type PickerEvent = { detail: { value: string | number } };
type InputEvent = { detail: { value: string } };
type TapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };

type ClassSessionRow = TeacherCalendarEvent & {
  dateLabel: string;
  timeLabel: string;
  statusLabel: string;
  attendanceLabel: string;
  isPast: boolean;
  dateChipClass: string;
};

type AttendanceRow = TeacherRosterStudent & {
  recorded: boolean;
  recordedStatus: AttendanceStatus | '';
  draftStatus: AttendanceStatus;
  statusLabel: string;
};

const STATUS_OPTIONS = [
  { value: 'recruiting' as const, label: '招生中' },
  { value: 'active' as const, label: '进行中' },
  { value: 'paused' as const, label: '暂停' },
  { value: 'completed' as const, label: '已完成' },
];

const CLASS_TABS: Array<{ key: ClassTab; label: string }> = [
  { key: 'schedule', label: '排课信息' },
  { key: 'students', label: '班级学员' },
  { key: 'attendance', label: '点名情况' },
];

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到场' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺勤' },
  { value: 'makeup', label: '补课' },
  { value: 'trial', label: '试听' },
];

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: '到场',
  late: '迟到',
  leave: '请假',
  absent: '缺勤',
  makeup: '补课',
  trial: '试听',
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function sessionDateLabel(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 周${
    '日一二三四五六'[date.getDay()]
  }`;
}

function sessionTimeLabel(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(
    end.getMinutes(),
  )}`;
}

function calendarRange() {
  const from = new Date();
  const to = new Date();
  from.setFullYear(from.getFullYear() - 5);
  to.setFullYear(to.getFullYear() + 5);
  return { from: from.toISOString(), to: to.toISOString() };
}

function normalizeSession(
  event: TeacherCalendarEvent,
  selectedAttendanceSessionId = '',
): ClassSessionRow {
  const statusLabel =
    event.status === 'completed'
      ? '已完成'
      : event.status === 'cancelled'
        ? '已取消'
        : '待上课';
  const attendanceLabel = event.rosterCount
    ? `已点 ${event.attendanceCount}/${event.rosterCount}`
    : '暂无学员';
  return {
    ...event,
    dateLabel: sessionDateLabel(event.startsAt),
    timeLabel: sessionTimeLabel(event.startsAt, event.endsAt),
    statusLabel,
    attendanceLabel,
    isPast: new Date(event.endsAt).getTime() < Date.now(),
    dateChipClass:
      event.id === selectedAttendanceSessionId
        ? 'attendance-date-chip attendance-date-chip-active'
        : 'attendance-date-chip',
  };
}

Page({
  data: {
    classId: '',
    loading: true,
    saving: false,
    memberSavingId: '',
    options: null as TeacherSchedulingOptions | null,
    classGroup: null as TeacherClass | null,
    canEditClass: false,
    canScheduleClass: false,
    activeTab: 'schedule' as ClassTab,
    classTabs: CLASS_TABS.map((tab) => ({
      ...tab,
      className: tab.key === 'schedule' ? 'detail-tab detail-tab-active' : 'detail-tab',
    })),
    statusLabel: '',
    teacherName: '',
    campusName: '',
    classroomName: '',
    sessions: [] as ClassSessionRow[],
    attendanceSessions: [] as ClassSessionRow[],
    upcomingSessionCount: 0,
    completedSessionCount: 0,
    classroomIndex: 0,
    statusIndex: 0,
    statusOptions: STATUS_OPTIONS,
    name: '',
    capacity: 8,
    settingsVisible: false,
    addStudentVisible: false,
    keyword: '',
    candidates: [] as TeacherStudentSearchItem[],
    studentLoading: false,
    attendanceStatusOptions: ATTENDANCE_OPTIONS,
    attendanceLoading: false,
    attendanceSaving: false,
    attendanceSessionId: '',
    attendanceSessionTitle: '',
    attendanceRows: [] as AttendanceRow[],
    attendanceError: '',
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ classId: String(query.classId || '') });
  },

  onShow() {
    if (this.data.classId) void this.load();
  },

  async load() {
    if (!this.data.classId) {
      this.setData({ loading: false, error: '缺少班级信息' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const [options, payload, events, capabilities] = await Promise.all([
        fetchTeacherSchedulingOptions(),
        fetchTeacherClass(this.data.classId),
        fetchTeacherCalendar(calendarRange()),
        fetchTeacherCapabilities(),
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
      const sessions = events
        .filter((event) => event.class?.id === classGroup.id)
        .sort((left, right) => {
          const leftTime = new Date(left.startsAt).getTime();
          const rightTime = new Date(right.startsAt).getTime();
          const now = Date.now();
          const leftFuture = leftTime >= now;
          const rightFuture = rightTime >= now;
          if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;
          return leftFuture ? leftTime - rightTime : rightTime - leftTime;
        })
        .map((event) => normalizeSession(event, this.data.attendanceSessionId));
      const canEditClass =
        options.permissions.manageClasses &&
        (classGroup.teacherId === capabilities.teacherId || capabilities.isAdminTeacher);
      this.setData({
        options,
        classGroup,
        canEditClass,
        canScheduleClass:
          options.permissions.createClassSession &&
          (classGroup.teacherId === capabilities.teacherId || capabilities.isAdminTeacher) &&
          ['recruiting', 'active'].includes(classGroup.status),
        classroomIndex,
        statusIndex,
        name: classGroup.name,
        capacity: classGroup.capacity,
        statusLabel:
          STATUS_OPTIONS.find((item) => item.value === classGroup.status)?.label ?? '未知状态',
        teacherName: classGroup.teacher?.name || '未指定老师',
        campusName: classGroup.campus?.name || '未设置校区',
        classroomName: classGroup.classroom?.name || '未分配教室',
        sessions,
        attendanceSessions: sessions.filter((session) => session.status !== 'cancelled'),
        upcomingSessionCount: sessions.filter(
          (session) => !session.isPast && session.status !== 'cancelled',
        ).length,
        completedSessionCount: sessions.filter(
          (session) => session.status === 'completed' || session.attendanceCount > 0,
        ).length,
        loading: false,
      });
      if (this.data.addStudentVisible) await this.searchCandidates();
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '班级信息加载失败',
      });
    }
  },

  switchTab(event: TapEvent) {
    const activeTab = event.currentTarget.dataset.key as ClassTab;
    if (!activeTab) return;
    this.setData({
      activeTab,
      classTabs: CLASS_TABS.map((tab) => ({
        ...tab,
        className: tab.key === activeTab ? 'detail-tab detail-tab-active' : 'detail-tab',
      })),
    });
  },

  toggleSettings() {
    this.setData({ settingsVisible: !this.data.settingsVisible });
  },

  toggleAddStudent() {
    const addStudentVisible = !this.data.addStudentVisible;
    this.setData({ addStudentVisible });
    if (addStudentVisible) void this.searchCandidates();
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
      wx.showToast({ title: '容量不能小于当前学员数', icon: 'none' });
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
      this.setData({ settingsVisible: false });
      await this.load();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },

  openScheduleCreate() {
    wx.navigateTo({
      url: `/pages/teacher-schedule-create/index?classId=${encodeURIComponent(this.data.classId)}`,
    });
  },

  openStudentDetail(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    if (!studentId) return;
    wx.navigateTo({
      url: `/pages/teacher-student-detail/index?studentId=${encodeURIComponent(studentId)}`,
    });
  },

  async searchCandidates() {
    const options = this.data.options;
    const classGroup = this.data.classGroup;
    const courseId = classGroup?.courseId ?? classGroup?.course?.id;
    if (
      !options ||
      !classGroup ||
      !courseId ||
      !options.permissions.viewAllStudents ||
      !options.permissions.enrollStudents
    ) {
      return;
    }
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
      content: `确定将${name}移出当前班级吗？历史课次和点名记录不会受影响。`,
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

  async selectAttendanceSession(event: TapEvent) {
    const sessionId = String(event.currentTarget.dataset.id || '');
    const session = (this.data.sessions as ClassSessionRow[]).find((item) => item.id === sessionId);
    if (!sessionId || !session) return;
    this.setData({
      attendanceSessionId: sessionId,
      attendanceSessionTitle: `${session.dateLabel} ${session.timeLabel}`,
      attendanceLoading: true,
      attendanceError: '',
      attendanceSessions: (this.data.attendanceSessions as ClassSessionRow[]).map((item) =>
        normalizeSession(item, sessionId),
      ),
    });
    try {
      const payload = await fetchTeacherSessionAttendance(sessionId);
      const recordByStudentId = new Map<string, SessionAttendanceRecord>(
        payload.attendanceRecords.map((record) => [record.studentId, record]),
      );
      const attendanceRows = payload.roster.map((student) => {
        const record = recordByStudentId.get(student.id);
        const recordedStatus: AttendanceStatus | '' = record?.status ?? '';
        return {
          ...student,
          recorded: Boolean(record),
          recordedStatus,
          draftStatus: (recordedStatus || 'present') as AttendanceStatus,
          statusLabel: record ? ATTENDANCE_LABEL[record.status] : '待点名',
        };
      });
      this.setData({ attendanceRows });
    } catch (error) {
      this.setData({
        attendanceError: error instanceof Error ? error.message : '点名名单加载失败',
      });
    } finally {
      this.setData({ attendanceLoading: false });
    }
  },

  selectAttendanceStatus(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const status = event.currentTarget.dataset.status as AttendanceStatus;
    if (!studentId || !status) return;
    const attendanceRows = (this.data.attendanceRows as AttendanceRow[]).map((row) =>
      row.id === studentId && !row.recorded ? { ...row, draftStatus: status } : row,
    );
    this.setData({ attendanceRows });
  },

  async saveAttendance() {
    if (!this.data.attendanceSessionId || this.data.attendanceSaving) return;
    const records = (this.data.attendanceRows as AttendanceRow[])
      .filter((row) => !row.recorded)
      .map((row) => ({ studentId: row.id, status: row.draftStatus }));
    if (!records.length) {
      wx.showToast({ title: '本课次已完成点名', icon: 'none' });
      return;
    }
    this.setData({ attendanceSaving: true, attendanceError: '' });
    try {
      await recordTeacherAttendance(this.data.attendanceSessionId, records);
      wx.showToast({ title: '点名已保存', icon: 'success' });
      await this.load();
      const selectedSessionId = this.data.attendanceSessionId;
      if (selectedSessionId) {
        await this.selectAttendanceSession({
          currentTarget: { dataset: { id: selectedSessionId } },
        });
      }
    } catch (error) {
      this.setData({
        attendanceError: error instanceof Error ? error.message : '点名保存失败',
      });
    } finally {
      this.setData({ attendanceSaving: false });
    }
  },
});
