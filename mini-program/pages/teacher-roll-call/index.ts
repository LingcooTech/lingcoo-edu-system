import {
  fetchTeacherClassSession,
  fetchTeacherSessionAttendance,
  recordTeacherAttendance,
  updateTeacherClassSession,
  type AttendanceStatus,
  type SessionAttendanceRecord,
  type TeacherSessionDetailRosterStudent,
} from '../../services/api';

type RollCallStatus = 'present' | 'late' | 'leave' | 'absent';
type TapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };
type InputEvent = { detail: { value: string } };

type RollCallRow = TeacherSessionDetailRosterStudent & {
  recorded: boolean;
  recordedStatus: RollCallStatus | '';
  draftStatus: RollCallStatus;
  dirty: boolean;
  balanceLabel: string;
  searchText: string;
};

const STATUS_OPTIONS: Array<{ value: RollCallStatus; label: string }> = [
  { value: 'present', label: '到课' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '未到' },
];

function displayStatus(status: AttendanceStatus): RollCallStatus {
  return status === 'makeup' || status === 'trial' ? 'present' : status;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateLabel(value: string) {
  const date = new Date(value);
  return `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 周${
    '日一二三四五六'[date.getDay()]
  }`;
}

function timeLabel(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(
    end.getMinutes(),
  )}`;
}

function summary(rows: RollCallRow[]) {
  return rows.reduce(
    (result, row) => {
      result[row.draftStatus] += 1;
      return result;
    },
    { present: 0, late: 0, leave: 0, absent: 0 } as Record<RollCallStatus, number>,
  );
}

Page({
  data: {
    sessionId: '',
    refreshOnShow: false,
    loading: true,
    saving: false,
    error: '',
    title: '',
    dateLabel: '',
    timeLabel: '',
    className: '',
    courseName: '',
    teacherName: '',
    classroomName: '',
    lessonUnits: 1,
    initialLessonUnits: 1,
    canEditSession: false,
    keyword: '',
    allRows: [] as RollCallRow[],
    rows: [] as RollCallRow[],
    statusOptions: STATUS_OPTIONS,
    summary: { present: 0, late: 0, leave: 0, absent: 0 },
  },

  onLoad(query: Record<string, string | undefined>) {
    const sessionId = String(query.sessionId || '');
    this.setData({ sessionId });
    void this.load();
  },

  onShow() {
    if (!this.data.refreshOnShow) return;
    this.setData({ refreshOnShow: false });
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
      const [detail, attendance] = await Promise.all([
        fetchTeacherClassSession(this.data.sessionId),
        fetchTeacherSessionAttendance(this.data.sessionId),
      ]);
      const recordByStudentId = new Map<string, SessionAttendanceRecord>(
        attendance.attendanceRecords.map((record) => [record.studentId, record]),
      );
      const allRows = detail.roster.map((student) => {
        const record = recordByStudentId.get(student.id);
        const recordedStatus = record ? displayStatus(record.status) : '';
        const billingAccount = student.lessonAccounts.find(
          (account) => account.courseId === student.billingCourseId,
        );
        return {
          ...student,
          recorded: Boolean(record),
          recordedStatus,
          draftStatus: recordedStatus || 'present',
          dirty: false,
          balanceLabel:
            typeof billingAccount?.balance === 'number' ? String(billingAccount.balance) : '-',
          searchText: `${student.name} ${student.grade} ${student.school || ''}`.toLocaleLowerCase(
            'zh-CN',
          ),
        } as RollCallRow;
      });
      const lessonUnits = detail.session.lessonUnits ?? 1;
      this.setData({
        loading: false,
        title: detail.session.topic || detail.course.name,
        dateLabel: dateLabel(detail.session.startsAt),
        timeLabel: timeLabel(detail.session.startsAt, detail.session.endsAt),
        className: detail.class?.name || '临时课次',
        courseName: detail.course.name,
        teacherName: detail.session.teacher?.name || '当前老师',
        classroomName: detail.classroom?.name || '上课地点待确认',
        lessonUnits,
        initialLessonUnits: lessonUnits,
        canEditSession: detail.canEdit,
        keyword: '',
        allRows,
        rows: allRows,
        summary: summary(allRows),
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '点名信息加载失败',
      });
    }
  },

  changeKeyword(event: InputEvent) {
    const keyword = event.detail.value;
    const normalized = keyword.trim().toLocaleLowerCase('zh-CN');
    const allRows = this.data.allRows as RollCallRow[];
    this.setData({
      keyword,
      rows: normalized ? allRows.filter((row) => row.searchText.includes(normalized)) : allRows,
    });
  },

  selectStatus(event: TapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const status = event.currentTarget.dataset.status as RollCallStatus;
    if (!studentId || !STATUS_OPTIONS.some((option) => option.value === status)) return;
    const allRows = (this.data.allRows as RollCallRow[]).map((row) =>
      row.id === studentId
        ? {
            ...row,
            draftStatus: status,
            dirty: row.recordedStatus !== status,
          }
        : row,
    );
    const keyword = this.data.keyword.trim().toLocaleLowerCase('zh-CN');
    this.setData({
      allRows,
      rows: keyword ? allRows.filter((row) => row.searchText.includes(keyword)) : allRows,
      summary: summary(allRows),
    });
  },

  decreaseUnits() {
    if (!this.data.canEditSession || this.data.lessonUnits <= 0) return;
    this.setData({ lessonUnits: Math.max(0, this.data.lessonUnits - 1) });
  },

  increaseUnits() {
    if (!this.data.canEditSession || this.data.lessonUnits >= 99) return;
    this.setData({ lessonUnits: this.data.lessonUnits + 1 });
  },

  openSessionEdit() {
    if (!this.data.sessionId) return;
    this.setData({ refreshOnShow: true });
    wx.navigateTo({
      url: `/pages/teacher-schedule-create/index?sessionId=${encodeURIComponent(
        this.data.sessionId,
      )}`,
    });
  },

  openRosterManage() {
    if (!this.data.sessionId) return;
    this.setData({ refreshOnShow: true });
    wx.navigateTo({
      url: `/pages/teacher-schedule-create/index?sessionId=${encodeURIComponent(
        this.data.sessionId,
      )}&focus=students`,
    });
  },

  async save() {
    if (!this.data.sessionId || this.data.saving) return;
    const allRows = this.data.allRows as RollCallRow[];
    if (!allRows.length) {
      wx.showToast({ title: '本课次暂无学员', icon: 'none' });
      return;
    }
    const lessonUnitsChanged = this.data.lessonUnits !== this.data.initialLessonUnits;
    const records = allRows
      .filter((row) => lessonUnitsChanged || !row.recorded || row.dirty)
      .map((row) => ({ studentId: row.id, status: row.draftStatus as AttendanceStatus }));
    if (!records.length) {
      wx.showToast({ title: '点名结果没有修改', icon: 'none' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      if (lessonUnitsChanged) {
        await updateTeacherClassSession(this.data.sessionId, {
          lessonUnits: this.data.lessonUnits,
        });
      }
      await recordTeacherAttendance(this.data.sessionId, records);
      wx.showToast({ title: '点名已保存', icon: 'success' });
      await this.load();
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : '点名保存失败',
      });
    } finally {
      this.setData({ saving: false });
    }
  },
});
