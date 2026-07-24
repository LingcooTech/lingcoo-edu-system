import {
  fetchTeacherCalendar,
  fetchTeacherCapabilities,
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
  type TeacherDashboardStudent,
  type TeacherNotification,
  type HomeworkAssignment,
  type TeacherHomeworkCheckIn,
  type TeacherLessonFeedback,
  type TeacherRosterStudent,
} from '../../services/api';
import { TEACHER_WORKBENCH_ICONS } from '../../utils/icons';

type ActiveView =
  | 'students'
  | 'classes'
  | 'schedule'
  | 'rollcall'
  | 'records'
  | 'feedbacks'
  | 'homework';
type MetricScope = 'today' | 'week' | 'month';
type FeedbackScope = 'today' | 'pending' | 'history';
type MiniTapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };
type MiniScrollEvent = { detail: { scrollLeft: number } };
type MiniInputEvent = {
  currentTarget: { dataset: Record<string, string | undefined> };
  detail: { value: string };
};
type MiniPickerEvent = { detail: { value: string | number } };

interface StudentRow {
  id: string;
  name: string;
  isMyStudent: boolean;
  classes: Array<{
    id: string;
    name: string;
    isMine: boolean;
    teacherName: string;
    campusId: string;
    campusName: string;
  }>;
  balances: Array<{
    courseId: string;
    courseName: string;
    balance: number | null;
    totalLessons: number | null;
    lessonCountLabel: string;
  }>;
  totalRemaining: number;
}

interface StudentFilterOption {
  id: string;
  label: string;
}

interface DateStripRow {
  key: string;
  anchorId: string;
  label: string;
  day: number;
  className: string;
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
  lessonUnits: number;
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
  { key: 'students', label: '学员', iconSrc: TEACHER_WORKBENCH_ICONS.students },
  { key: 'classes', label: '班级', iconSrc: TEACHER_WORKBENCH_ICONS.classes },
  { key: 'schedule', label: '课表', iconSrc: TEACHER_WORKBENCH_ICONS.schedule },
  { key: 'rollcall', label: '点名', iconSrc: TEACHER_WORKBENCH_ICONS.rollcall },
  { key: 'records', label: '上课记录', iconSrc: TEACHER_WORKBENCH_ICONS.records },
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

function dateStripDaysAround(value: Date) {
  const selected = startOfDay(value);
  return Array.from({ length: 61 }, (_, index) => addDays(selected, index - 30));
}

function buildDateStripRows(
  days: Date[],
  calendarEvents: TeacherCalendarEvent[],
  selectedDateKey: string,
): DateStripRow[] {
  const eventDateKeys = new Set(
    (calendarEvents ?? []).map((event) => dateKey(new Date(event.startsAt))),
  );
  return days.map((day) => {
    const key = dateKey(day);
    return {
      key,
      anchorId: `schedule-date-${key}`,
      label: `周${'日一二三四五六'[day.getDay()]}`,
      day: day.getDate(),
      className:
        key === selectedDateKey ? 'day day-active' : eventDateKeys.has(key) ? 'day day-has' : 'day',
    };
  });
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
    lessonUnits: event.lessonUnits ?? 1,
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
  const from = addMonths(startOfMonth(new Date()), -60);
  const to = addMonths(startOfMonth(new Date()), 60);
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
  return activeView === key ? 'quick-action quick-action-active' : 'quick-action';
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
    isMine: classGroup.isMine !== false,
    teacherName: classGroup.teacher?.name || '',
    scopeLabel: classGroup.isMine !== false ? '我的班级' : classGroup.teacher?.name || '机构班级',
    statusLabel: CLASS_STATUS_LABEL[classGroup.status] ?? '未知状态',
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
    isMine: event.isMine !== false,
    teacherName: event.teacher?.name || '',
    scopeLabel: event.isMine !== false ? '我的课次' : event.teacher?.name || '机构课次',
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

  properties: {
    canSwitchRole: {
      type: Boolean,
      value: false,
    },
    switchingRole: {
      type: Boolean,
      value: false,
    },
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
    rollCallEvents: [] as Array<ReturnType<typeof normalizeEvent>>,
    recordEvents: [] as Array<ReturnType<typeof normalizeEvent>>,
    dateStripDays: [] as DateStripRow[],
    selectedDateAnchor: '',
    visibleDateKey: dateKey(startOfDay(new Date())),
    dateStripExtending: false,
    monthDays: [] as Array<{
      key: string;
      day: number;
      eventCount: number;
      className: string;
    }>,
    selectedDateKey: dateKey(startOfDay(new Date())),
    classes: [] as Array<ReturnType<typeof normalizeClass>>,
    allStudents: [] as StudentRow[],
    students: [] as StudentRow[],
    studentSearchKeyword: '',
    studentCampusFilterIndex: 0,
    studentClassFilterIndex: 0,
    studentCourseFilterIndex: 0,
    studentLessonFilterIndex: 0,
    studentCampusFilterOptions: [{ id: '', label: '全部校区' }] as StudentFilterOption[],
    studentClassFilterOptions: [{ id: '', label: '全部班级' }] as StudentFilterOption[],
    studentCourseFilterOptions: [{ id: '', label: '全部课程' }] as StudentFilterOption[],
    studentLessonFilterOptions: [
      { id: '', label: '全部课时' },
      { id: 'lte3', label: '≤3课时' },
      { id: '4to10', label: '4-10课时' },
      { id: 'gt10', label: '>10课时' },
    ] as StudentFilterOption[],
    studentFilteredCount: 0,
    studentPage: 1,
    studentPageSize: 15,
    studentTotalPages: 1,
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
    canSchedule: false,
    canManageClasses: false,
  },

  lifetimes: {
    attached() {
      this.reload();
    },
  },

  methods: {
    requestRoleSwitch() {
      this.triggerEvent('switchrole');
    },

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
          capabilities,
        ] = await Promise.all([
          fetchTeacherDashboard(),
          fetchTeacherCalendar(calendarRange()),
          fetchTeacherHomeworkCheckIns(),
          fetchTeacherLessonFeedbacks(),
          fetchTeacherHomeworkAssignments(),
          fetchTeacherNotifications({ status: 'unread', limit: 20 }),
          fetchTeacherCapabilities(),
        ]);
        const today = startOfDay(new Date());
        const selectedDateKey = this.data.selectedDateKey || dateKey(today);
        const dashboardClasses = Array.isArray(dashboard.classes) ? dashboard.classes : [];
        const calendarItems = Array.isArray(calendarEvents) ? calendarEvents : [];
        const homeworkItems = Array.isArray(homeworkCheckIns) ? homeworkCheckIns : [];
        const feedbackItems = Array.isArray(lessonFeedbacks) ? lessonFeedbacks : [];
        const assignmentItems = Array.isArray(homeworkAssignments) ? homeworkAssignments : [];
        const notificationItems = Array.isArray(teacherNotifications) ? teacherNotifications : [];
        const normalizedClasses = dashboardClasses.map(normalizeClass);
        const studentRows = this.buildStudentRows(
          dashboard.students,
          dashboardClasses,
        ) as StudentRow[];
        const classFilterOptions: StudentFilterOption[] = [
          { id: '', label: '全部班级' },
          ...normalizedClasses.map((classGroup) => ({
            id: classGroup.id,
            label: classGroup.name,
          })),
        ];
        const campusOptionMap = new Map<string, string>();
        for (const classGroup of normalizedClasses) {
          if (classGroup.campus?.id) {
            campusOptionMap.set(classGroup.campus.id, classGroup.campus.name);
          }
        }
        const campusFilterOptions: StudentFilterOption[] = [
          { id: '', label: '全部校区' },
          ...Array.from(campusOptionMap, ([id, label]) => ({ id, label })),
        ];
        const courseOptionMap = new Map<string, string>();
        for (const student of studentRows) {
          for (const balance of student.balances) {
            if (balance.courseId) courseOptionMap.set(balance.courseId, balance.courseName);
          }
        }
        const courseFilterOptions: StudentFilterOption[] = [
          { id: '', label: '全部课程' },
          ...Array.from(courseOptionMap, ([id, label]) => ({ id, label })),
        ];
        this.setData({
          loading: false,
          calendarEvents: calendarItems,
          classes: normalizedClasses,
          allStudents: studentRows,
          students: studentRows.slice(0, this.data.studentPageSize),
          studentCampusFilterOptions: campusFilterOptions,
          studentClassFilterOptions: classFilterOptions,
          studentCourseFilterOptions: courseFilterOptions,
          studentCampusFilterIndex: 0,
          studentClassFilterIndex: 0,
          studentCourseFilterIndex: 0,
          studentLessonFilterIndex: 0,
          studentFilteredCount: studentRows.length,
          studentPage: 1,
          studentTotalPages: Math.max(1, Math.ceil(studentRows.length / this.data.studentPageSize)),
          lessonFeedbacks: feedbackItems,
          homeworkAssignments: assignmentItems,
          teacherNotifications: notificationItems.map(normalizeTeacherNotification),
          pendingAttentionCount: notificationItems.filter((item) => item.status === 'unread')
            .length,
          canSchedule:
            capabilities.permissions.createClassSession ||
            capabilities.permissions.createAdHocSession,
          canManageClasses: capabilities.permissions.manageClasses,
          homeworkCheckIns: homeworkItems.map((item) => ({
            ...item,
            statusLabel: HOMEWORK_STATUS_LABEL[item.reviewStatus] ?? '未知状态',
            dateLabel: formatDateTime(item.createdAt),
            studentName: item.student?.name || '成员',
            courseName: item.course?.name || item.title,
            className: item.class?.name || '班级',
            scopeLabel: item.isMine !== false ? '我的学员' : '机构学员',
          })),
          selectedDateKey,
        });
        this.applyStudentFilters();
        this.recompute();
      } catch (error) {
        this.setData({ loading: false });
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
      }
    },

    buildStudentRows(
      students?: TeacherDashboardStudent[],
      legacyClasses: TeacherClass[] = [],
    ): StudentRow[] {
      if (Array.isArray(students)) {
        return students.map((student) => {
          const balances = (student.lessonAccounts ?? []).map((lessonAccount) => {
            const totalLessons = Number.isFinite(lessonAccount.totalLessons)
              ? lessonAccount.totalLessons
              : null;
            return {
              courseId: lessonAccount.courseId,
              courseName: lessonAccount.courseName,
              balance: lessonAccount.balance,
              totalLessons,
              lessonCountLabel: `剩余${lessonAccount.balance}/总计${totalLessons ?? '-'}`,
            };
          });
          return {
            id: student.id,
            name: student.name,
            isMyStudent: student.isMyStudent,
            classes: (student.classes ?? []).map((classGroup) => ({
              id: classGroup.id,
              name: classGroup.name,
              isMine: classGroup.isMine,
              teacherName: classGroup.teacher?.name || '',
              campusId: classGroup.campus?.id || '',
              campusName: classGroup.campus?.name || '',
            })),
            balances,
            totalRemaining: balances.reduce((sum, balance) => sum + (balance.balance ?? 0), 0),
          };
        });
      }

      const rows = new Map<string, StudentRow>();
      for (const classGroup of legacyClasses ?? []) {
        for (const student of classGroup.students ?? []) {
          const current = rows.get(student.id) ?? {
            id: student.id,
            name: student.name,
            isMyStudent: true,
            classes: [],
            balances: [],
            totalRemaining: 0,
          };
          current.classes.push({
            id: classGroup.id,
            name: classGroup.name,
            isMine: true,
            teacherName: '',
            campusId: classGroup.campus?.id || classGroup.campusId || '',
            campusName: classGroup.campus?.name || '',
          });
          if (classGroup.course?.name) {
            const balance =
              student.lessonBalance === null || student.lessonBalance === undefined
                ? null
                : student.lessonBalance;
            current.balances.push({
              courseId: classGroup.course.id,
              courseName: classGroup.course.name,
              balance,
              totalLessons: null,
              lessonCountLabel: balance === null ? '剩余-/总计-' : `剩余${balance}/总计-`,
            });
            current.totalRemaining += balance ?? 0;
          }
          rows.set(student.id, current);
        }
      }
      return Array.from(rows.values());
    },

    applyStudentFilters(resetPage = false) {
      const keyword = String(this.data.studentSearchKeyword || '')
        .trim()
        .toLocaleLowerCase('zh-CN');
      const campusOptions = this.data.studentCampusFilterOptions as StudentFilterOption[];
      const classOptions = this.data.studentClassFilterOptions as StudentFilterOption[];
      const courseOptions = this.data.studentCourseFilterOptions as StudentFilterOption[];
      const lessonOptions = this.data.studentLessonFilterOptions as StudentFilterOption[];
      const campusId = campusOptions[this.data.studentCampusFilterIndex]?.id || '';
      const classId = classOptions[this.data.studentClassFilterIndex]?.id || '';
      const courseId = courseOptions[this.data.studentCourseFilterIndex]?.id || '';
      const lessonRange = lessonOptions[this.data.studentLessonFilterIndex]?.id || '';
      const filtered = (this.data.allStudents as StudentRow[]).filter((student) => {
        if (keyword && !student.name.toLocaleLowerCase('zh-CN').includes(keyword)) {
          return false;
        }
        if (
          campusId &&
          !student.classes.some((classGroup) => classGroup.campusId === campusId)
        ) {
          return false;
        }
        if (classId && !student.classes.some((classGroup) => classGroup.id === classId)) {
          return false;
        }
        const targetBalances = courseId
          ? student.balances.filter((balance) => balance.courseId === courseId)
          : student.balances;
        if (courseId && targetBalances.length === 0) {
          return false;
        }
        const remaining = targetBalances.reduce((sum, balance) => sum + (balance.balance ?? 0), 0);
        if (lessonRange === 'lte3') return remaining <= 3;
        if (lessonRange === '4to10') return remaining >= 4 && remaining <= 10;
        if (lessonRange === 'gt10') return remaining > 10;
        return true;
      });
      const totalPages = Math.max(1, Math.ceil(filtered.length / this.data.studentPageSize));
      const requestedPage = resetPage ? 1 : Number(this.data.studentPage);
      const page = Math.max(1, Math.min(requestedPage, totalPages));
      const start = (page - 1) * this.data.studentPageSize;
      this.setData({
        students: filtered.slice(start, start + this.data.studentPageSize),
        studentFilteredCount: filtered.length,
        studentPage: page,
        studentTotalPages: totalPages,
      });
    },

    onStudentSearchInput(event: MiniInputEvent) {
      this.setData({ studentSearchKeyword: event.detail.value });
      this.applyStudentFilters(true);
    },

    onStudentCampusFilterChange(event: MiniPickerEvent) {
      this.setData({ studentCampusFilterIndex: Number(event.detail.value) || 0 });
      this.applyStudentFilters(true);
    },

    onStudentClassFilterChange(event: MiniPickerEvent) {
      this.setData({ studentClassFilterIndex: Number(event.detail.value) || 0 });
      this.applyStudentFilters(true);
    },

    onStudentCourseFilterChange(event: MiniPickerEvent) {
      this.setData({ studentCourseFilterIndex: Number(event.detail.value) || 0 });
      this.applyStudentFilters(true);
    },

    onStudentLessonFilterChange(event: MiniPickerEvent) {
      this.setData({ studentLessonFilterIndex: Number(event.detail.value) || 0 });
      this.applyStudentFilters(true);
    },

    resetStudentFilters() {
      this.setData({
        studentSearchKeyword: '',
        studentCampusFilterIndex: 0,
        studentClassFilterIndex: 0,
        studentCourseFilterIndex: 0,
        studentLessonFilterIndex: 0,
      });
      this.applyStudentFilters(true);
    },

    previousStudentPage() {
      if (this.data.studentPage <= 1) return;
      this.setData({ studentPage: this.data.studentPage - 1 });
      this.applyStudentFilters();
    },

    nextStudentPage() {
      if (this.data.studentPage >= this.data.studentTotalPages) return;
      this.setData({ studentPage: this.data.studentPage + 1 });
      this.applyStudentFilters();
    },

    recompute() {
      const today = startOfDay(new Date());
      const selectedDate = new Date(`${this.data.selectedDateKey}T00:00:00`);
      const dateStripDays = dateStripDaysAround(selectedDate);
      const monthDays = monthDaysAround(selectedDate);
      const currentWeekDays = weekDaysAround(today);
      const weekStart = currentWeekDays[0];
      const weekEnd = addDays(currentWeekDays[6], 1);
      const monthStart = startOfMonth(today);
      const monthEnd = addMonths(monthStart, 1);
      const calendarEvents = this.data.calendarEvents as TeacherCalendarEvent[];
      const homeworkCheckIns = this.data.homeworkCheckIns as TeacherHomeworkCheckIn[];
      const lessonFeedbacks = this.data.lessonFeedbacks as TeacherLessonFeedback[];
      let metricEvents = calendarEvents.filter((event) =>
        sameDate(new Date(event.startsAt), today),
      );
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
        .filter(
          (event) => sameDate(new Date(event.startsAt), today) && event.status !== 'cancelled',
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      const todayPendingEvents = todayEvents.filter(
        (event) => event.isMine !== false && isRollCallPending(event),
      );
      const pendingHomeworkCount = homeworkCheckIns.filter(
        (item) => item.reviewStatus === 'submitted' || item.reviewStatus === 'needs_revision',
      ).length;
      const recordEvents = calendarEvents
        .filter(
          (event) =>
            event.status !== 'cancelled' &&
            (event.status === 'completed' || event.attendanceCount > 0),
        )
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
        .slice(0, 60);
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
          badge:
            item.key === 'rollcall'
              ? todayPendingEvents.length
              : item.key === 'homework'
                ? pendingHomeworkCount
                : 0,
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
          pendingRollCall: metricEvents.filter(
            (event) => event.isMine !== false && isRollCallPending(event),
          ).length,
          leaveMessages: metricEvents.reduce(
            (sum, event) => sum + (event.attendanceSummary?.leave ?? 0),
            0,
          ),
          pendingHomework: pendingHomeworkCount,
        },
        todayCourseCount: todayEvents.length,
        todayPendingCount: todayPendingEvents.length,
        todaySummaryText: todayEvents.length
          ? `今天共有 ${todayEvents.length} 场课程`
          : '今天暂无课程',
        todayPendingEvents: todayPendingEvents.map(normalizeEvent),
        rollCallEvents: todayPendingEvents.map(normalizeEvent),
        recordEvents: recordEvents.map(normalizeEvent),
        selectedEvents: calendarEvents
          .filter((event) => dateKey(new Date(event.startsAt)) === this.data.selectedDateKey)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          .map(normalizeEvent),
        dateStripDays: buildDateStripRows(dateStripDays, calendarEvents, this.data.selectedDateKey),
        selectedDateAnchor: `schedule-date-${dateKey(addDays(selectedDate, -3))}`,
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
      this.setData({ selectedDateKey: key, visibleDateKey: key });
      this.recompute();
    },

    onDateStripScroll(event: MiniScrollEvent) {
      const rows = this.data.dateStripDays as DateStripRow[];
      if (!rows.length) return;
      const system = wx.getSystemInfoSync();
      const windowWidth = system.windowWidth || 375;
      const pxPerRpx = windowWidth / 750;
      const itemStep = 102 * pxPerRpx;
      const viewportCenter = event.detail.scrollLeft + windowWidth / 2;
      const index = Math.max(
        0,
        Math.min(rows.length - 1, Math.round((viewportCenter - 16 * pxPerRpx) / itemStep)),
      );
      const visibleDate = new Date(`${rows[index].key}T00:00:00`);
      const monthLabel = `${visibleDate.getFullYear()}年${visibleDate.getMonth() + 1}月`;
      if (monthLabel !== this.data.monthLabel || rows[index].key !== this.data.visibleDateKey) {
        this.setData({ monthLabel, visibleDateKey: rows[index].key });
      }
    },

    extendDateStripForward() {
      if (this.data.dateStripExtending) return;
      const rows = this.data.dateStripDays as DateStripRow[];
      const last = rows[rows.length - 1];
      if (!last) return;
      const lastDate = new Date(`${last.key}T00:00:00`);
      const additions = Array.from({ length: 60 }, (_, index) => addDays(lastDate, index + 1));
      this.setData(
        {
          dateStripExtending: true,
          dateStripDays: [
            ...rows,
            ...buildDateStripRows(
              additions,
              this.data.calendarEvents as TeacherCalendarEvent[],
              this.data.selectedDateKey,
            ),
          ],
        },
        () => this.setData({ dateStripExtending: false }),
      );
    },

    extendDateStripBackward() {
      if (this.data.dateStripExtending) return;
      const rows = this.data.dateStripDays as DateStripRow[];
      const first = rows[0];
      if (!first) return;
      const firstDate = new Date(`${first.key}T00:00:00`);
      const additions = Array.from({ length: 60 }, (_, index) => addDays(firstDate, index - 60));
      this.setData(
        {
          dateStripExtending: true,
          selectedDateAnchor: '',
          dateStripDays: [
            ...buildDateStripRows(
              additions,
              this.data.calendarEvents as TeacherCalendarEvent[],
              this.data.selectedDateKey,
            ),
            ...rows,
          ],
        },
        () => {
          this.setData({
            selectedDateAnchor: first.anchorId,
            dateStripExtending: false,
          });
        },
      );
    },

    toggleCalendar() {
      const calendarExpanded = !this.data.calendarExpanded;
      this.setData({
        calendarExpanded,
        ...(calendarExpanded && this.data.visibleDateKey
          ? { selectedDateKey: this.data.visibleDateKey }
          : {}),
      });
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
        const classAssignment = assignments.find((item) => !item.studentId)?.content ?? '';
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
        this.setData({
          feedbackError: error instanceof Error ? error.message : '互动名单加载失败',
        });
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

    openScheduleCreate() {
      wx.navigateTo({ url: '/pages/teacher-schedule-create/index' });
    },

    openClassCreate() {
      wx.navigateTo({ url: '/pages/teacher-class-create/index' });
    },

    openClassManage(event: MiniTapEvent) {
      const classId = String(event.currentTarget.dataset.id || '');
      if (!classId) return;
      wx.navigateTo({
        url: `/pages/teacher-class-manage/index?classId=${encodeURIComponent(classId)}`,
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
