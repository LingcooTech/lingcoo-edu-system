import {
  fetchTeacherCalendar,
  fetchTeacherDashboard,
  fetchTeacherHomeworkAssignments,
  fetchTeacherHomeworkCheckIns,
  fetchTeacherLessonFeedbacks,
  fetchTeacherNotifications,
  fetchTeacherSessionAttendance,
  markTeacherNotificationRead,
  recordTeacherAttendance,
  reviewTeacherHomeworkCheckIn,
  saveTeacherSessionFeedbacks,
  type AttendanceStatus,
  type SessionAttendanceRecord,
  type TeacherCalendarEvent,
  type TeacherClass,
  type TeacherNotification,
  type HomeworkAssignment,
  type TeacherHomeworkCheckIn,
  type TeacherLessonFeedback,
  type TeacherRosterStudent,
} from '../../services/api';
import { TEACHER_WORKBENCH_ICONS } from '../../utils/icons';

type ActiveView = 'schedule' | 'classes' | 'students' | 'feedbacks' | 'homework';
type MetricScope = 'today' | 'week' | 'month';
type FeedbackScope = 'today' | 'pending' | 'history';
type MiniTapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };
type MiniInputEvent = { currentTarget: { dataset: Record<string, string | undefined> }; detail: { value: string } };

interface StudentRow {
  id: string;
  name: string;
  grade: string;
  school: string;
  classes: string[];
  balances: Array<{ courseName: string; balance: string }>;
}

interface RollCallRow extends TeacherRosterStudent {
  recorded: boolean;
  recordedStatus: AttendanceStatus | '';
  draftStatus: AttendanceStatus;
  statusLabel: string;
}

interface FeedbackRow extends TeacherRosterStudent {
  content: string;
  rating: number;
  imageUrls: string[];
  assignmentContent: string;
  personalAssignmentEnabled: boolean;
}

type SheetSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  timeLabel: string;
  title: string;
  status: string;
  className: string;
  courseName: string;
  classroomName: string;
};

type TeacherNoticeItem = {
  id: string;
  category: string;
  title: string;
  body: string;
  status: string;
  dateLabel: string;
  actionLabel: string;
  studentId: string;
  courseId: string;
  className: string;
};

const VIEW_TABS: Array<{ key: ActiveView; label: string; iconSrc: string }> = [
  { key: 'schedule', label: '课表', iconSrc: TEACHER_WORKBENCH_ICONS.schedule },
  { key: 'classes', label: '班级', iconSrc: TEACHER_WORKBENCH_ICONS.classes },
  { key: 'students', label: '成员', iconSrc: TEACHER_WORKBENCH_ICONS.students },
  { key: 'feedbacks', label: '互动', iconSrc: TEACHER_WORKBENCH_ICONS.feedbacks },
  { key: 'homework', label: '批阅', iconSrc: TEACHER_WORKBENCH_ICONS.homework },
];

const SCOPE_TABS: Array<{ key: MetricScope; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
];

const FEEDBACK_SCOPE_TABS: Array<{ key: FeedbackScope; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'pending', label: '待互动' },
  { key: 'history', label: '历史' },
];

const CLASS_STATUS_LABEL: Record<string, string> = {
  recruiting: '招生中',
  active: '进行中',
  completed: '已完成',
  paused: '暂停',
  archived: '已归档',
};

const HOMEWORK_STATUS_LABEL: Record<string, string> = {
  submitted: '待批阅',
  reviewed: '已批阅',
  needs_revision: '需订正',
};

const ATTENDANCE_STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到场' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺勤' },
  { value: 'makeup', label: '补参与' },
  { value: 'trial', label: '试听' },
];

const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '到场',
  late: '迟到',
  leave: '请假',
  absent: '缺勤',
  makeup: '补参与',
  trial: '试听',
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfMonth(value: Date) {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function weekDaysAround(value: Date) {
  const base = startOfDay(value);
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(base, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function monthDaysAround(value: Date) {
  const monthStart = startOfMonth(value);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function pad(input: number) {
  return String(input).padStart(2, '0');
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 周${'日一二三四五六'[date.getDay()]}`;
}

function timeRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(end.getHours())}:${pad(
    end.getMinutes(),
  )}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function normalizeTeacherNotification(item: TeacherNotification): TeacherNoticeItem {
  const meta = (item.meta ?? {}) as Record<string, unknown>;
  const studentId = typeof meta.studentId === 'string' ? meta.studentId : '';
  const courseId = typeof meta.courseId === 'string' ? meta.courseId : '';
  const actionLabel =
    item.category === 'teacher.student.enrolled'
      ? '查看分班'
      : item.category === 'teacher.trial.reserved'
        ? '查看试听'
        : '查看';
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    body: item.body,
    status: item.status,
    dateLabel: formatDateTime(item.createdAt),
    actionLabel,
    studentId,
    courseId,
    className: item.status === 'unread' ? 'notice-card notice-card-unread' : 'notice-card',
  };
}

function formatSheetSession(event: TeacherCalendarEvent): SheetSession {
  return {
    id: event.id,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    dateLabel: dateLabel(event.startsAt),
    timeLabel: timeRange(event.startsAt, event.endsAt),
    title: event.title || '课程内容',
    status: event.status,
    className: event.class?.name || '班级',
    courseName: event.course?.name || '课程',
    classroomName: event.classroom?.name || '空间待确认',
  };
}

function countStatuses(rows: RollCallRow[]) {
  return rows.reduce(
    (acc, row) => {
      const status = row.recordedStatus || row.draftStatus;
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    { present: 0, late: 0, leave: 0, absent: 0, makeup: 0, trial: 0 } as Record<
      AttendanceStatus,
      number
    >,
  );
}

function calendarRange() {
  const from = addDays(startOfMonth(new Date()), -365);
  const to = addMonths(startOfMonth(new Date()), 3);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function isRollCallPending(event: TeacherCalendarEvent) {
  return (
    event.status !== 'cancelled' &&
    event.status !== 'completed' &&
    event.rosterCount > 0 &&
    event.attendanceCount < event.rosterCount
  );
}

function viewClassName(activeView: ActiveView, key: ActiveView) {
  return activeView === key ? 'tab tab-active' : 'tab';
}

function scopeClassName(metricScope: MetricScope, key: MetricScope) {
  return metricScope === key ? 'scope scope-active' : 'scope';
}

function feedbackScopeClassName(activeScope: FeedbackScope, key: FeedbackScope) {
  return activeScope === key ? 'feedback-scope feedback-scope-active' : 'feedback-scope';
}

function summaryTitle(metricScope: MetricScope) {
  if (metricScope === 'today') return '今日安排';
  if (metricScope === 'week') return '本周安排';
  return '本月安排';
}

function normalizeClass(classGroup: TeacherClass) {
  return {
    ...classGroup,
    statusLabel: CLASS_STATUS_LABEL[classGroup.status] ?? classGroup.status,
    courseName: classGroup.course?.name || '课程',
    classroomName: classGroup.classroom?.name || '空间待确认',
    remainingSeats: Math.max(classGroup.capacity - classGroup.students.length, 0),
    students: classGroup.students.map((student) => ({
      ...student,
      school: student.school || '',
      lessonBalanceLabel: student.lessonBalance ?? '-',
    })),
  };
}

function normalizeEvent(event: TeacherCalendarEvent) {
  const pending = isRollCallPending(event);
  return {
    ...event,
    dateLabel: dateLabel(event.startsAt),
    timeLabel: timeRange(event.startsAt, event.endsAt),
    className: event.class?.name || '班级',
    courseName: event.course?.name || '课程',
    classroomName: event.classroom?.name || '空间待确认',
    statusLabel: pending ? '未签到' : event.status === 'completed' ? '已完成' : '已排课',
    leaveCount: event.attendanceSummary?.leave ?? 0,
    pending,
  };
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  data: {
    loading: true,
    activeView: 'schedule' as ActiveView,
    metricScope: 'today' as MetricScope,
    activeFeedbackScope: 'today' as FeedbackScope,
    summaryTitle: summaryTitle('today'),
    viewTabs: VIEW_TABS.map((item) => ({
      ...item,
      className: viewClassName('schedule', item.key),
    })),
    scopeTabs: SCOPE_TABS.map((item) => ({
      ...item,
      className: scopeClassName('today', item.key),
    })),
    feedbackScopeTabs: FEEDBACK_SCOPE_TABS.map((item) => ({
      ...item,
      count: 0,
      className: feedbackScopeClassName('today', item.key),
    })),
    stats: { courseCount: 0, pendingRollCall: 0, leaveMessages: 0, pendingHomework: 0 },
    teacherNotifications: [] as TeacherNoticeItem[],
    pendingAttentionCount: 0,
    todayCourseCount: 0,
    todayPendingCount: 0,
    todaySummaryText: '今天暂无课程',
    calendarExpanded: false,
    monthLabel: '',
    monthWeekdays: ['日', '一', '二', '三', '四', '五', '六'],
    todayPendingEvents: [] as Array<ReturnType<typeof normalizeEvent>>,
    selectedEvents: [] as Array<ReturnType<typeof normalizeEvent>>,
    weekDays: [] as Array<{ key: string; label: string; day: number; className: string }>,
    monthDays: [] as Array<{
      key: string;
      day: number;
      eventCount: number;
      className: string;
    }>,
    selectedDateKey: dateKey(startOfDay(new Date())),
    classes: [] as Array<ReturnType<typeof normalizeClass>>,
    students: [] as StudentRow[],
    feedbackEvents: [] as Array<
      ReturnType<typeof normalizeEvent> & {
        feedbackCount: number;
        interactionStatusLabel: string;
      }
    >,
    feedbackEmptyText: '今天暂无可互动场次。',
    homeworkCheckIns: [] as Array<
      TeacherHomeworkCheckIn & {
        statusLabel: string;
        dateLabel: string;
        studentName: string;
        courseName: string;
        className: string;
      }
    >,
    calendarEvents: [] as TeacherCalendarEvent[],
    lessonFeedbacks: [] as TeacherLessonFeedback[],
    homeworkAssignments: [] as HomeworkAssignment[],
    attendanceStatusOptions: ATTENDANCE_STATUS_OPTIONS,
    rollCallVisible: false,
    rollCallLoading: false,
    rollCallSaving: false,
    rollCallError: '',
    rollCallSession: null as SheetSession | null,
    rollCallRows: [] as RollCallRow[],
    rollCallSummary: { present: 0, late: 0, leave: 0, absent: 0, makeup: 0, trial: 0 },
    feedbackVisible: false,
    feedbackLoading: false,
    feedbackSaving: false,
    feedbackError: '',
    feedbackSession: null as SheetSession | null,
    feedbackRows: [] as FeedbackRow[],
    classAssignmentContent: '',
    assignmentTemplates: ['复习本次重点', '完成练习一页', '整理课程记录'],
    starOptions: [1, 2, 3, 4, 5],
    reviewVisible: false,
    reviewSaving: false,
    reviewError: '',
    reviewTarget: null as
      | (TeacherHomeworkCheckIn & {
          statusLabel: string;
          dateLabel: string;
          studentName: string;
          courseName: string;
          className: string;
        })
      | null,
    reviewStatus: 'reviewed' as 'reviewed' | 'needs_revision',
    teacherFeedback: '',
    reviewRating: 0,
  },

  lifetimes: {
    attached() {
      this.reload();
    },
  },

  methods: {
  refresh() {
    return this.reload();
  },

  async reload() {
    this.setData({ loading: true });
    try {
      const [
        dashboard,
        calendarEvents,
        homeworkCheckIns,
        lessonFeedbacks,
        homeworkAssignments,
        teacherNotifications,
      ] = await Promise.all([
        fetchTeacherDashboard(),
        fetchTeacherCalendar(calendarRange()),
        fetchTeacherHomeworkCheckIns(),
        fetchTeacherLessonFeedbacks(),
        fetchTeacherHomeworkAssignments(),
        fetchTeacherNotifications({ status: 'unread', limit: 20 }),
      ]);
      const today = startOfDay(new Date());
      const selectedDateKey = this.data.selectedDateKey || dateKey(today);
      this.setData({
        loading: false,
        calendarEvents,
        classes: dashboard.classes.map(normalizeClass),
        students: this.buildStudentRows(dashboard.classes),
        lessonFeedbacks,
        homeworkAssignments,
        teacherNotifications: teacherNotifications.map(normalizeTeacherNotification),
        pendingAttentionCount: teacherNotifications.filter((item) => item.status === 'unread').length,
        homeworkCheckIns: homeworkCheckIns.map((item) => ({
          ...item,
          statusLabel: HOMEWORK_STATUS_LABEL[item.reviewStatus] ?? item.reviewStatus,
          dateLabel: formatDateTime(item.createdAt),
          studentName: item.student?.name || '成员',
          courseName: item.course?.name || item.title,
          className: item.class?.name || '班级',
        })),
        selectedDateKey,
      });
      this.recompute();
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
    }
  },

  buildStudentRows(classes: TeacherClass[]): StudentRow[] {
    const rows = new Map<string, StudentRow>();
    for (const classGroup of classes) {
      for (const student of classGroup.students) {
        const current = rows.get(student.id) ?? {
          id: student.id,
          name: student.name,
          grade: student.grade,
          school: student.school || '',
          classes: [],
          balances: [],
        };
        current.classes.push(classGroup.name);
        if (classGroup.course?.name) {
          current.balances.push({
            courseName: classGroup.course.name,
            balance:
              student.lessonBalance === null || student.lessonBalance === undefined
                ? '-'
                : String(student.lessonBalance),
          });
        }
        rows.set(student.id, current);
      }
    }
    return Array.from(rows.values());
  },

  recompute() {
    const today = startOfDay(new Date());
    const selectedDate = new Date(`${this.data.selectedDateKey}T00:00:00`);
    const weekDays = weekDaysAround(selectedDate);
    const monthDays = monthDaysAround(selectedDate);
    const currentWeekDays = weekDaysAround(today);
    const weekStart = currentWeekDays[0];
    const weekEnd = addDays(currentWeekDays[6], 1);
    const monthStart = startOfMonth(today);
    const monthEnd = addMonths(monthStart, 1);
    const calendarEvents = this.data.calendarEvents as TeacherCalendarEvent[];
    const homeworkCheckIns = this.data.homeworkCheckIns as TeacherHomeworkCheckIn[];
    const lessonFeedbacks = this.data.lessonFeedbacks as TeacherLessonFeedback[];
    let metricEvents = calendarEvents.filter((event) => sameDate(new Date(event.startsAt), today));
    if (this.data.metricScope === 'week') {
      metricEvents = calendarEvents.filter((event) => {
        const startsAt = new Date(event.startsAt);
        return startsAt >= weekStart && startsAt < weekEnd;
      });
    }
    if (this.data.metricScope === 'month') {
      metricEvents = calendarEvents.filter((event) => {
        const startsAt = new Date(event.startsAt);
        return startsAt >= monthStart && startsAt < monthEnd;
      });
    }
    const todayEvents = calendarEvents
      .filter((event) => sameDate(new Date(event.startsAt), today) && event.status !== 'cancelled')
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const todayPendingEvents = todayEvents.filter(isRollCallPending);
    const feedbackCountBySession = new Map<string, number>();
    for (const feedback of lessonFeedbacks) {
      feedbackCountBySession.set(
        feedback.classSessionId,
        (feedbackCountBySession.get(feedback.classSessionId) ?? 0) + 1,
      );
    }
    const now = new Date();
    const pendingStart = addDays(today, -14);
    const historyStart = addDays(today, -30);
    const feedbackRows = calendarEvents
      .filter((event) => event.status !== 'cancelled' && new Date(event.startsAt) <= now)
      .map((event) => {
        const feedbackCount = feedbackCountBySession.get(event.id) ?? 0;
        const complete = event.rosterCount > 0 && feedbackCount >= event.rosterCount;
        return {
          ...normalizeEvent(event),
          feedbackCount,
          interactionStatusLabel: complete
            ? '已完成'
            : feedbackCount > 0
              ? `已互动 ${feedbackCount}/${event.rosterCount}`
              : '未互动',
        };
      });
    const todayFeedbackEvents = feedbackRows
      .filter((event) => sameDate(new Date(event.startsAt), today))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const pendingFeedbackEvents = feedbackRows
      .filter((event) => {
        const startsAt = new Date(event.startsAt);
        return (
          startsAt >= pendingStart &&
          startsAt <= now &&
          !sameDate(startsAt, today) &&
          event.rosterCount > 0 &&
          event.feedbackCount < event.rosterCount
        );
      })
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    const historyFeedbackEvents = feedbackRows
      .filter((event) => {
        const startsAt = new Date(event.startsAt);
        return startsAt >= historyStart && startsAt <= now && !sameDate(startsAt, today);
      })
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    const feedbackBuckets: Record<FeedbackScope, typeof feedbackRows> = {
      today: todayFeedbackEvents,
      pending: pendingFeedbackEvents,
      history: historyFeedbackEvents,
    };
    const feedbackEmptyTextMap: Record<FeedbackScope, string> = {
      today: '今天暂无可互动场次。',
      pending: '近14天暂无待补互动场次。',
      history: '近30天暂无历史互动场次。',
    };
    const activeFeedbackScope = this.data.activeFeedbackScope as FeedbackScope;
    this.setData({
      viewTabs: VIEW_TABS.map((item) => ({
        ...item,
        className: viewClassName(this.data.activeView, item.key),
      })),
      scopeTabs: SCOPE_TABS.map((item) => ({
        ...item,
        className: scopeClassName(this.data.metricScope, item.key),
      })),
      feedbackScopeTabs: FEEDBACK_SCOPE_TABS.map((item) => ({
        ...item,
        count: feedbackBuckets[item.key].length,
        className: feedbackScopeClassName(activeFeedbackScope, item.key),
      })),
      summaryTitle: summaryTitle(this.data.metricScope),
      stats: {
        courseCount: metricEvents.filter((event) => event.status !== 'cancelled').length,
        pendingRollCall: metricEvents.filter(isRollCallPending).length,
        leaveMessages: metricEvents.reduce(
          (sum, event) => sum + (event.attendanceSummary?.leave ?? 0),
          0,
        ),
        pendingHomework: homeworkCheckIns.filter(
          (item) => item.reviewStatus === 'submitted' || item.reviewStatus === 'needs_revision',
        ).length,
      },
      todayCourseCount: todayEvents.length,
      todayPendingCount: todayPendingEvents.length,
      todaySummaryText: todayEvents.length ? `今天共有 ${todayEvents.length} 场课程` : '今天暂无课程',
      todayPendingEvents: todayPendingEvents.map(normalizeEvent),
      selectedEvents: calendarEvents
        .filter((event) => dateKey(new Date(event.startsAt)) === this.data.selectedDateKey)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .map(normalizeEvent),
      weekDays: weekDays.map((day) => {
        const key = dateKey(day);
        const hasSession = calendarEvents.some(
          (event) => dateKey(new Date(event.startsAt)) === key,
        );
        return {
          key,
          label: `周${'日一二三四五六'[day.getDay()]}`,
          day: day.getDate(),
          className:
            key === this.data.selectedDateKey
              ? 'day day-active'
              : hasSession
                ? 'day day-has'
                : 'day',
        };
      }),
      monthLabel: `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`,
      monthDays: monthDays.map((day) => {
        const key = dateKey(day);
        const eventCount = calendarEvents.filter(
          (event) => dateKey(new Date(event.startsAt)) === key,
        ).length;
        const inCurrentMonth = day.getMonth() === selectedDate.getMonth();
        return {
          key,
          day: day.getDate(),
          eventCount,
          className:
            key === this.data.selectedDateKey
              ? 'month-day month-day-active'
              : eventCount
                ? `month-day month-day-has${inCurrentMonth ? '' : ' month-day-muted'}`
                : `month-day${inCurrentMonth ? '' : ' month-day-muted'}`,
        };
      }),
      feedbackEvents: feedbackBuckets[activeFeedbackScope].slice(0, 30),
      feedbackEmptyText: feedbackEmptyTextMap[activeFeedbackScope],
    });
  },

  switchView(event: MiniTapEvent) {
    const key = event.currentTarget.dataset.key as ActiveView;
    this.setData({ activeView: key });
    this.recompute();
  },

  switchScope(event: MiniTapEvent) {
    const key = event.currentTarget.dataset.key as MetricScope;
    this.setData({ metricScope: key });
    this.recompute();
  },

  handleSummaryTap(event: MiniTapEvent) {
    const action = String(event.currentTarget.dataset.action || '');
    if (action === 'homework') {
      this.setData({ activeView: 'homework' });
      this.recompute();
      return;
    }
    if (action === 'leave' || action === 'rollcall' || action === 'schedule') {
      this.setData({
        activeView: 'schedule',
        selectedDateKey: dateKey(startOfDay(new Date())),
      });
      this.recompute();
    }
  },

  async openTeacherNotification(event: MiniTapEvent) {
    const notificationId = String(event.currentTarget.dataset.id || '');
    const notice = (this.data.teacherNotifications as TeacherNoticeItem[]).find(
      (item) => item.id === notificationId,
    );
    if (!notice) return;
    if (notice.category === 'teacher.student.enrolled' && notice.studentId) {
      if (notice.status === 'unread') {
        await markTeacherNotificationRead(notificationId).catch(() => null);
      }
      wx.navigateTo({
        url: `/pages/teacher-student-detail/index?studentId=${encodeURIComponent(
          notice.studentId,
        )}&courseId=${encodeURIComponent(notice.courseId)}&notificationId=${encodeURIComponent(
          notificationId,
        )}&tab=overview`,
      });
      return;
    }
    if (notice.status === 'unread') {
      await markTeacherNotificationRead(notificationId).catch(() => null);
      await this.reload();
    }
    wx.showToast({ title: '已标记关注', icon: 'none' });
  },

  switchFeedbackScope(event: MiniTapEvent) {
    const key = event.currentTarget.dataset.key as FeedbackScope;
    if (!key) return;
    this.setData({ activeFeedbackScope: key });
    this.recompute();
  },

  selectDay(event: MiniTapEvent) {
    const key = String(event.currentTarget.dataset.key || '');
    if (!key) return;
    this.setData({ selectedDateKey: key });
    this.recompute();
  },

  toggleCalendar() {
    this.setData({ calendarExpanded: !this.data.calendarExpanded });
    this.recompute();
  },

  findCalendarEvent(id: string) {
    return (this.data.calendarEvents as TeacherCalendarEvent[]).find((event) => event.id === id);
  },

  async openRollCall(event: MiniTapEvent) {
    const sessionId = String(event.currentTarget.dataset.id || '');
    const calendarEvent = this.findCalendarEvent(sessionId);
    if (!calendarEvent) return;
    this.setData({
      rollCallVisible: true,
      rollCallLoading: true,
      rollCallSaving: false,
      rollCallError: '',
      rollCallSession: formatSheetSession(calendarEvent),
      rollCallRows: [],
    });
    try {
      const payload = await fetchTeacherSessionAttendance(sessionId);
      const recordByStudentId = new Map<string, SessionAttendanceRecord>(
        payload.attendanceRecords.map((record) => [record.studentId, record]),
      );
      const rows = payload.roster.map((student) => {
        const record = recordByStudentId.get(student.id);
        const recordedStatus: AttendanceStatus | '' = record?.status ?? '';
        const draftStatus = (recordedStatus || 'present') as AttendanceStatus;
        return {
          ...student,
          recorded: Boolean(record),
          recordedStatus,
          draftStatus,
          statusLabel: record ? ATTENDANCE_STATUS_LABEL[record.status] : '待签到',
        };
      });
      this.setData({
        rollCallRows: rows,
        rollCallSummary: countStatuses(rows),
      });
    } catch (error) {
      this.setData({ rollCallError: error instanceof Error ? error.message : '花名册加载失败' });
    } finally {
      this.setData({ rollCallLoading: false });
    }
  },

  selectRollCallStatus(event: MiniTapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const status = event.currentTarget.dataset.status as AttendanceStatus;
    if (!studentId || !status) return;
    const rows = (this.data.rollCallRows as RollCallRow[]).map((row) =>
      row.id === studentId && !row.recorded ? { ...row, draftStatus: status } : row,
    );
    this.setData({
      rollCallRows: rows,
      rollCallSummary: countStatuses(rows),
    });
  },

  async submitRollCall() {
    const session = this.data.rollCallSession as SheetSession | null;
    if (!session) return;
    const rows = this.data.rollCallRows as RollCallRow[];
    const records = rows
      .filter((row) => !row.recorded)
      .map((row) => ({ studentId: row.id, status: row.draftStatus }));
    if (records.length === 0) {
      wx.showToast({ title: '已完成签到', icon: 'none' });
      return;
    }
    this.setData({ rollCallSaving: true, rollCallError: '' });
    try {
      await recordTeacherAttendance(session.id, records);
      wx.showToast({ title: '签到已保存', icon: 'success' });
      this.setData({ rollCallVisible: false });
      await this.reload();
    } catch (error) {
      this.setData({ rollCallError: error instanceof Error ? error.message : '签到保存失败' });
    } finally {
      this.setData({ rollCallSaving: false });
    }
  },

  async openFeedback(event: MiniTapEvent) {
    const sessionId = String(event.currentTarget.dataset.id || '');
    const calendarEvent = this.findCalendarEvent(sessionId);
    if (!calendarEvent) return;
    this.setData({
      feedbackVisible: true,
      feedbackLoading: true,
      feedbackSaving: false,
      feedbackError: '',
      feedbackSession: formatSheetSession(calendarEvent),
      feedbackRows: [],
    });
    try {
      const payload = await fetchTeacherSessionAttendance(sessionId);
      const feedbackByStudentId = new Map(
        (this.data.lessonFeedbacks as TeacherLessonFeedback[])
          .filter((item) => item.classSessionId === sessionId)
          .map((item) => [item.studentId, item]),
      );
      const assignments = (this.data.homeworkAssignments as HomeworkAssignment[]).filter(
        (item) => item.classSessionId === sessionId,
      );
      const classAssignment =
        assignments.find((item) => !item.studentId)?.content ?? '';
      const assignmentByStudentId = new Map(
        assignments
          .filter((item) => item.studentId)
          .map((item) => [String(item.studentId), item.content]),
      );
      this.setData({
        classAssignmentContent: classAssignment,
        feedbackRows: payload.roster.map((student) => ({
          ...student,
          content: feedbackByStudentId.get(student.id)?.content ?? '',
          rating: feedbackByStudentId.get(student.id)?.rating ?? 0,
          imageUrls: feedbackByStudentId.get(student.id)?.imageUrls ?? [],
          assignmentContent: assignmentByStudentId.get(student.id) ?? '',
          personalAssignmentEnabled: assignmentByStudentId.has(student.id),
        })),
      });
    } catch (error) {
      this.setData({ feedbackError: error instanceof Error ? error.message : '互动名单加载失败' });
    } finally {
      this.setData({ feedbackLoading: false });
    }
  },

  updateFeedbackContent(event: MiniInputEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const value = event.detail.value;
    const rows = (this.data.feedbackRows as FeedbackRow[]).map((row) =>
      row.id === studentId ? { ...row, content: value } : row,
    );
    this.setData({ feedbackRows: rows });
  },

  selectFeedbackRating(event: MiniTapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const rating = Number(event.currentTarget.dataset.rating || 0);
    if (!studentId || Number.isNaN(rating)) return;
    const rows = (this.data.feedbackRows as FeedbackRow[]).map((row) =>
      row.id === studentId ? { ...row, rating } : row,
    );
    this.setData({ feedbackRows: rows });
  },

  updateClassAssignment(event: { detail: { value: string } }) {
    this.setData({ classAssignmentContent: event.detail.value });
  },

  applyAssignmentTemplate(event: MiniTapEvent) {
    const value = String(event.currentTarget.dataset.value || '');
    if (!value) return;
    this.setData({ classAssignmentContent: value });
  },

  togglePersonalAssignment(event: MiniTapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const rows = (this.data.feedbackRows as FeedbackRow[]).map((row) =>
      row.id === studentId
        ? { ...row, personalAssignmentEnabled: !row.personalAssignmentEnabled }
        : row,
    );
    this.setData({ feedbackRows: rows });
  },

  updateStudentAssignment(event: MiniInputEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    const value = event.detail.value;
    const rows = (this.data.feedbackRows as FeedbackRow[]).map((row) =>
      row.id === studentId ? { ...row, assignmentContent: value } : row,
    );
    this.setData({ feedbackRows: rows });
  },

  async submitFeedback() {
    const session = this.data.feedbackSession as SheetSession | null;
    if (!session) return;
    const rows = this.data.feedbackRows as FeedbackRow[];
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
    this.setData({ feedbackSaving: true, feedbackError: '' });
    try {
      await saveTeacherSessionFeedbacks(session.id, {
        items,
        classAssignmentContent: String(this.data.classAssignmentContent || '').trim(),
        studentAssignments,
      });
      wx.showToast({ title: '互动已保存', icon: 'success' });
      this.setData({ feedbackVisible: false });
      await this.reload();
    } catch (error) {
      this.setData({ feedbackError: error instanceof Error ? error.message : '互动保存失败' });
    } finally {
      this.setData({ feedbackSaving: false });
    }
  },

  openReview(event: MiniTapEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    const target = (
      this.data.homeworkCheckIns as Array<NonNullable<typeof this.data.reviewTarget>>
    ).find((item) => item.id === id);
    if (!target) return;
    this.setData({
      reviewVisible: true,
      reviewSaving: false,
      reviewError: '',
      reviewTarget: target,
      reviewStatus: target.reviewStatus === 'needs_revision' ? 'needs_revision' : 'reviewed',
      teacherFeedback: target.teacherFeedback ?? '',
      reviewRating: target.rating ?? 0,
    });
  },

  selectReviewStatus(event: MiniTapEvent) {
    const status = event.currentTarget.dataset.status;
    if (status === 'reviewed' || status === 'needs_revision') {
      this.setData({ reviewStatus: status });
    }
  },

  updateTeacherFeedback(event: { detail: { value: string } }) {
    this.setData({ teacherFeedback: event.detail.value });
  },

  selectReviewRating(event: MiniTapEvent) {
    const rating = Number(event.currentTarget.dataset.rating || 0);
    if (Number.isNaN(rating)) return;
    this.setData({ reviewRating: rating });
  },

  openStudentDetail(event: MiniTapEvent) {
    const studentId = String(event.currentTarget.dataset.id || '');
    if (!studentId) return;
    wx.navigateTo({
      url: `/pages/teacher-student-detail/index?studentId=${encodeURIComponent(studentId)}`,
    });
  },

  previewImage(event: MiniTapEvent) {
    const current = String(event.currentTarget.dataset.url || '');
    if (!current) return;
    const homeworkImages = (this.data.homeworkCheckIns as TeacherHomeworkCheckIn[]).flatMap(
      (item) => item.imageUrls ?? [],
    );
    const feedbackImages = (this.data.feedbackRows as FeedbackRow[]).flatMap(
      (item) => item.imageUrls ?? [],
    );
    const reviewImages = this.data.reviewTarget?.imageUrls ?? [];
    const urls = Array.from(new Set([...homeworkImages, ...feedbackImages, ...reviewImages]));
    wx.previewImage({ current, urls: urls.length ? urls : [current] });
  },

  async submitReview() {
    const target = this.data.reviewTarget;
    if (!target) return;
    this.setData({ reviewSaving: true, reviewError: '' });
    try {
      await reviewTeacherHomeworkCheckIn(target.id, {
        reviewStatus: this.data.reviewStatus,
        teacherFeedback:
          this.data.reviewStatus === 'needs_revision'
            ? String(this.data.teacherFeedback || '').trim()
            : '',
        rating: Number(this.data.reviewRating || 0),
      });
      wx.showToast({ title: '批阅已保存', icon: 'success' });
      this.setData({ reviewVisible: false });
      await this.reload();
    } catch (error) {
      this.setData({ reviewError: error instanceof Error ? error.message : '批阅保存失败' });
    } finally {
      this.setData({ reviewSaving: false });
    }
  },

  closeRollCall() {
    if (this.data.rollCallSaving) return;
    this.setData({ rollCallVisible: false });
  },

  closeFeedback() {
    if (this.data.feedbackSaving) return;
    this.setData({ feedbackVisible: false });
  },

  closeReview() {
    if (this.data.reviewSaving) return;
    this.setData({ reviewVisible: false });
  },

  noop() {
    return;
  },
  },
});
