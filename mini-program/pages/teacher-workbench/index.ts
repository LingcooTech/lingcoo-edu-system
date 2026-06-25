import {
  fetchTeacherCalendar,
  fetchTeacherDashboard,
  fetchTeacherHomeworkCheckIns,
  fetchTeacherLessonFeedbacks,
  type TeacherCalendarEvent,
  type TeacherClass,
  type TeacherHomeworkCheckIn,
  type TeacherLessonFeedback,
} from '../../services/api';

type ActiveView = 'schedule' | 'classes' | 'students' | 'feedbacks' | 'homework';
type MetricScope = 'today' | 'week';
type MiniTapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };

interface StudentRow {
  id: string;
  name: string;
  grade: string;
  school: string;
  classes: string[];
  balances: Array<{ courseName: string; balance: string }>;
}

const VIEW_TABS: Array<{ key: ActiveView; label: string }> = [
  { key: 'schedule', label: '课表' },
  { key: 'classes', label: '班级' },
  { key: 'students', label: '学员' },
  { key: 'feedbacks', label: '课后点评' },
  { key: 'homework', label: '作业批阅' },
];

const SCOPE_TABS: Array<{ key: MetricScope; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
];

const CLASS_STATUS_LABEL: Record<string, string> = {
  recruiting: '招生中',
  active: '开课中',
  completed: '已结课',
  paused: '暂停',
  archived: '已归档',
};

const HOMEWORK_STATUS_LABEL: Record<string, string> = {
  submitted: '待批阅',
  reviewed: '已批阅',
  needs_revision: '需订正',
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

function calendarRange(days = 30) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = addDays(from, days);
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

function normalizeClass(classGroup: TeacherClass) {
  return {
    ...classGroup,
    statusLabel: CLASS_STATUS_LABEL[classGroup.status] ?? classGroup.status,
    courseName: classGroup.course?.name || '课程',
    classroomName: classGroup.classroom?.name || '教室待确认',
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
    classroomName: event.classroom?.name || '教室待确认',
    statusLabel: pending ? '未点名' : event.status === 'completed' ? '已完成' : '已排课',
    leaveCount: event.attendanceSummary?.leave ?? 0,
    pending,
  };
}

Page({
  data: {
    loading: true,
    activeView: 'schedule' as ActiveView,
    metricScope: 'today' as MetricScope,
    viewTabs: VIEW_TABS.map((item) => ({
      ...item,
      className: viewClassName('schedule', item.key),
    })),
    scopeTabs: SCOPE_TABS.map((item) => ({
      ...item,
      className: scopeClassName('today', item.key),
    })),
    stats: { courseCount: 0, pendingRollCall: 0, leaveMessages: 0, pendingHomework: 0 },
    todayPendingEvents: [] as Array<ReturnType<typeof normalizeEvent>>,
    selectedEvents: [] as Array<ReturnType<typeof normalizeEvent>>,
    weekDays: [] as Array<{ key: string; label: string; day: number; className: string }>,
    selectedDateKey: dateKey(startOfDay(new Date())),
    classes: [] as Array<ReturnType<typeof normalizeClass>>,
    students: [] as StudentRow[],
    feedbackEvents: [] as Array<ReturnType<typeof normalizeEvent> & { feedbackCount: number }>,
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
  },

  onLoad() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  async reload() {
    this.setData({ loading: true });
    try {
      const [dashboard, calendarEvents, homeworkCheckIns, lessonFeedbacks] = await Promise.all([
        fetchTeacherDashboard(),
        fetchTeacherCalendar(calendarRange(30)),
        fetchTeacherHomeworkCheckIns(),
        fetchTeacherLessonFeedbacks(),
      ]);
      const today = startOfDay(new Date());
      const selectedDateKey = this.data.selectedDateKey || dateKey(today);
      this.setData({
        loading: false,
        calendarEvents,
        classes: dashboard.classes.map(normalizeClass),
        students: this.buildStudentRows(dashboard.classes),
        lessonFeedbacks,
        homeworkCheckIns: homeworkCheckIns.map((item) => ({
          ...item,
          statusLabel: HOMEWORK_STATUS_LABEL[item.reviewStatus] ?? item.reviewStatus,
          dateLabel: formatDateTime(item.createdAt),
          studentName: item.student?.name || '学员',
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
    const currentWeekDays = weekDaysAround(today);
    const weekStart = currentWeekDays[0];
    const weekEnd = addDays(currentWeekDays[6], 1);
    const calendarEvents = this.data.calendarEvents as TeacherCalendarEvent[];
    const homeworkCheckIns = this.data.homeworkCheckIns as TeacherHomeworkCheckIn[];
    const lessonFeedbacks = this.data.lessonFeedbacks as TeacherLessonFeedback[];
    const metricEvents =
      this.data.metricScope === 'today'
        ? calendarEvents.filter((event) => sameDate(new Date(event.startsAt), today))
        : calendarEvents.filter((event) => {
            const startsAt = new Date(event.startsAt);
            return startsAt >= weekStart && startsAt < weekEnd;
          });
    const feedbackCountBySession = new Map<string, number>();
    for (const feedback of lessonFeedbacks) {
      feedbackCountBySession.set(
        feedback.classSessionId,
        (feedbackCountBySession.get(feedback.classSessionId) ?? 0) + 1,
      );
    }
    this.setData({
      viewTabs: VIEW_TABS.map((item) => ({
        ...item,
        className: viewClassName(this.data.activeView, item.key),
      })),
      scopeTabs: SCOPE_TABS.map((item) => ({
        ...item,
        className: scopeClassName(this.data.metricScope, item.key),
      })),
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
      todayPendingEvents: calendarEvents
        .filter((event) => sameDate(new Date(event.startsAt), today) && isRollCallPending(event))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .map(normalizeEvent),
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
      feedbackEvents: calendarEvents
        .filter((event) => event.status !== 'cancelled')
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
        .slice(0, 10)
        .map((event) => ({
          ...normalizeEvent(event),
          feedbackCount: feedbackCountBySession.get(event.id) ?? 0,
        })),
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

  selectDay(event: MiniTapEvent) {
    const key = String(event.currentTarget.dataset.key || '');
    if (!key) return;
    this.setData({ selectedDateKey: key });
    this.recompute();
  },

  openRollCall() {
    wx.showToast({ title: '请在 Web 老师端完成点名', icon: 'none' });
  },

  openFeedback() {
    wx.showToast({ title: '请在 Web 老师端填写点评', icon: 'none' });
  },
});
