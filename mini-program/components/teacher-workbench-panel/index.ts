import {
  createTeacherCourseContract,
  createTeacherStudent,
  fetchTeacherTrialWorkbench,
  fetchTeacherCalendar,
  fetchTeacherCapabilities,
  fetchTeacherDashboard,
  fetchTeacherHomeworkAssignments,
  fetchTeacherHomeworkCheckIns,
  fetchTeacherLessonFeedbacks,
  fetchTeacherNotifications,
  fetchTeacherSchedulingOptions,
  fetchTeacherSessionAttendance,
  markTeacherNotificationRead,
  recordTeacherAttendance,
  reviewTeacherHomeworkCheckIn,
  saveTeacherSessionFeedbacks,
  scheduleTeacherTrialLead,
  type AttendanceStatus,
  type Course,
  type CoursePackage,
  type SessionAttendanceRecord,
  type TeacherCalendarEvent,
  type TeacherClass,
  type TeacherDashboardStudent,
  type TeacherNotification,
  type HomeworkAssignment,
  type TeacherHomeworkCheckIn,
  type TeacherLessonFeedback,
  type TeacherRosterStudent,
  type TeacherSchedulingOptions,
  type TeacherTrialLead,
  type TeacherTrialSession,
} from '../../services/api';
import { TEACHER_WORKBENCH_ICONS } from '../../utils/icons';

type ActiveView =
  | 'students'
  | 'classes'
  | 'schedule'
  | 'trials'
  | 'rollcall'
  | 'records'
  | 'feedbacks'
  | 'homework';
type MetricScope = 'today' | 'week' | 'month';
type FeedbackScope = 'today' | 'pending' | 'history';
type RecordScope = 'pending' | 'history';
type TrialSessionScope = 'pending' | 'history';
type MiniTapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };
type MiniScrollEvent = { detail: { scrollLeft: number } };
type MiniInputEvent = {
  currentTarget: { dataset: Record<string, string | undefined> };
  detail: { value: string };
};
type MiniPickerEvent = {
  currentTarget: { dataset: Record<string, string | undefined> };
  detail: { value: string | number };
};
type PhoneWx = typeof wx & {
  makePhoneCall(options: { phoneNumber: string; fail?: () => void }): void;
};

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
  campusId?: string;
}

interface ContractStudentOption {
  id: string;
  label: string;
  searchText: string;
}

interface ContractCourseOption {
  id: string;
  label: string;
  courseSeriesId?: string | null;
}

interface ContractPackageOption {
  id: string;
  label: string;
  lessonCount: number;
  priceAmount: number;
  billingType: 'lesson' | 'period';
  periodUnit?: 'week' | 'month' | null;
  periodCount: number;
}

interface ContractClassOption {
  id: string;
  label: string;
  courseId?: string;
}

interface StudentCreateForm {
  name: string;
  grade: string;
  school: string;
  guardianName: string;
  guardianPhone: string;
}

interface ContractCreateForm {
  title: string;
  lessonCount: string;
  paidYuan: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'wechat_offline' | 'alipay_offline' | 'offline_other';
  startsAt: string;
  endsAt: string;
  note: string;
}

interface DateStripRow {
  key: string;
  anchorId: string;
  label: string;
  day: number;
  className: string;
}

type WorkbenchCalendarEvent = TeacherCalendarEvent & {
  canOperate: boolean;
  canManageRoster: boolean;
};

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

type TeacherTrialSessionRow = TeacherTrialSession & {
  dateLabel: string;
  timeLabel: string;
  courseName: string;
  campusName: string;
  teacherName: string;
  statusLabel: string;
  confirmationLabel: string;
  confirmationClassName: string;
};

type TeacherTrialLeadRow = TeacherTrialLead & {
  courseName: string;
  campusName: string;
  teacherName: string;
  statusLabel: string;
  createdLabel: string;
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
  { key: 'trials', label: '试听', iconSrc: TEACHER_WORKBENCH_ICONS.trials },
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

const RECORD_SCOPE_TABS: Array<{ key: RecordScope; label: string }> = [
  { key: 'pending', label: '待完善' },
  { key: 'history', label: '历史记录' },
];

const CLASS_STATUS_LABEL: Record<string, string> = {
  recruiting: '招生中',
  active: '进行中',
  completed: '已完成',
  paused: '暂停',
  archived: '已归档',
};

const CLASS_FILTER_OPTIONS: StudentFilterOption[] = [
  { id: '', label: '全部状态' },
  { id: 'recruiting', label: '招生中' },
  { id: 'active', label: '进行中' },
  { id: 'paused', label: '暂停' },
  { id: 'completed', label: '已完成' },
];

const HOMEWORK_STATUS_LABEL: Record<string, string> = {
  submitted: '待批阅',
  reviewed: '已批阅',
  needs_revision: '需订正',
};

const ATTENDANCE_STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到课' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '未到' },
];

const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '到课',
  late: '迟到',
  leave: '请假',
  absent: '未到',
  makeup: '补参与',
  trial: '试听',
};

const TRIAL_LEAD_STATUS_LABEL: Record<string, string> = {
  new: '待联系',
  contacted: '已联系',
  follow_up: '跟进中',
  trial_booked: '已约试听',
  trial_attended: '已试听',
  paid: '已转正式',
  course_delivery: '课程交付',
  invalid: '无效',
};

const TRIAL_SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: '待试听',
  completed: '已结束',
  cancelled: '已取消',
};

const PAYMENT_METHOD_OPTIONS = [
  { value: 'wechat_offline', label: '微信线下' },
  { value: 'alipay_offline', label: '支付宝线下' },
  { value: 'cash', label: '现金' },
  { value: 'bank_transfer', label: '银行转账' },
  { value: 'offline_other', label: '其他线下' },
] as const;

const EMPTY_STUDENT_CREATE_FORM: StudentCreateForm = {
  name: '',
  grade: '',
  school: '',
  guardianName: '',
  guardianPhone: '',
};

const EMPTY_CONTRACT_CREATE_FORM: ContractCreateForm = {
  title: '',
  lessonCount: '',
  paidYuan: '',
  paymentMethod: 'wechat_offline',
  startsAt: '',
  endsAt: '',
  note: '',
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

function dateInputValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
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
      const displayStatus = status === 'makeup' || status === 'trial' ? 'present' : status;
      acc[displayStatus] = (acc[displayStatus] ?? 0) + 1;
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
    event.type === 'class_session' &&
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

function buildStudentClassFilterOptions(
  classes: Array<ReturnType<typeof normalizeClass>>,
  campusId = '',
): StudentFilterOption[] {
  return [
    { id: '', label: '全部班级' },
    ...classes
      .filter((classGroup) => !campusId || classGroup.campus?.id === campusId)
      .map((classGroup) => ({
        id: classGroup.id,
        label: classGroup.name,
        campusId: classGroup.campus?.id || '',
      })),
  ];
}

function effectivePackagePrice(coursePackage: CoursePackage) {
  return coursePackage.discountPriceAmount ?? coursePackage.priceAmount;
}

function effectivePackageLessonCount(coursePackage: CoursePackage) {
  return (coursePackage.lessonCount ?? 0) + (coursePackage.giftedLessonCount ?? 0);
}

function moneyYuan(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function dateToApiDateTime(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function dateToApiEndDateTime(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : null;
}

function packageMatchesCourse(coursePackage: CoursePackage, course: Course | null) {
  if (!course) return false;
  if (coursePackage.courseId) return coursePackage.courseId === course.id;
  return Boolean(
    coursePackage.courseSeriesId && coursePackage.courseSeriesId === course.courseSeriesId,
  );
}

function buildContractStudentOptions(students: StudentRow[]): ContractStudentOption[] {
  return students.map((student) => ({
    id: student.id,
    label: student.name,
    searchText: [
      student.name,
      ...student.classes.map((classGroup) => classGroup.name),
      ...student.balances.map((balance) => balance.courseName),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN'),
  }));
}

function buildContractCourseOptions(courses: Course[]): ContractCourseOption[] {
  return [
    { id: '', label: '选择课程' },
    ...courses.map((course) => ({
      id: course.id,
      label: course.name,
      courseSeriesId: course.courseSeriesId,
    })),
  ];
}

function buildContractPackageOptions(
  coursePackages: CoursePackage[],
  selectedCourse: Course | null,
): ContractPackageOption[] {
  return [
    {
      id: '',
      label: '自定义课时',
      lessonCount: 0,
      priceAmount: 0,
      billingType: 'lesson' as const,
      periodCount: 1,
    },
    ...coursePackages
      .filter((item) => packageMatchesCourse(item, selectedCourse))
      .map((item) => {
        const lessonCount = effectivePackageLessonCount(item);
        const priceAmount = effectivePackagePrice(item);
        return {
          id: item.id,
          label:
            item.billingType === 'period'
              ? `${item.name} · ${item.periodCount}${item.periodUnit === 'week' ? '周' : '个月'} · 上限${lessonCount}课时 · ¥${moneyYuan(priceAmount)}`
              : `${item.name} · ${lessonCount}课时 · ¥${moneyYuan(priceAmount)}`,
          lessonCount,
          priceAmount,
          billingType: item.billingType ?? 'lesson',
          periodUnit: item.periodUnit,
          periodCount: item.periodCount ?? 1,
        };
      }),
  ];
}

function periodEndDateKey(startsOn: string, coursePackage: ContractPackageOption) {
  if (coursePackage.billingType !== 'period' || !coursePackage.periodUnit || !startsOn) return '';
  const end = new Date(`${startsOn}T00:00:00`);
  if (coursePackage.periodUnit === 'week') {
    end.setDate(end.getDate() + coursePackage.periodCount * 7 - 1);
  } else {
    const originalDay = end.getDate();
    end.setDate(1);
    end.setMonth(end.getMonth() + coursePackage.periodCount);
    const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    end.setDate(Math.min(originalDay, lastDay));
    end.setDate(end.getDate() - 1);
  }
  return dateKey(end);
}

function packageFormPatch(
  coursePackage: ContractPackageOption | undefined,
  currentForm: ContractCreateForm,
): Partial<ContractCreateForm> {
  if (!coursePackage?.id) return {};
  const patch: Partial<ContractCreateForm> = {
    lessonCount: String(coursePackage.lessonCount),
    paidYuan: String(moneyYuan(coursePackage.priceAmount)),
  };
  if (coursePackage.billingType === 'period') {
    patch.startsAt = currentForm.startsAt || dateKey(new Date());
    patch.endsAt = periodEndDateKey(patch.startsAt, coursePackage);
  }
  if (!(currentForm.title || '').trim()) {
    patch.title = coursePackage.label.split(' · ')[0];
  }
  return patch;
}

function buildContractClassOptions(
  classes: TeacherSchedulingOptions['classes'],
  selectedCourseId = '',
): ContractClassOption[] {
  if (!selectedCourseId) {
    return [{ id: '', label: '暂不入班' }];
  }
  return [
    { id: '', label: '暂不入班' },
    ...classes
      .filter((classGroup) => !selectedCourseId || classGroup.courseId === selectedCourseId)
      .map((classGroup) => ({
        id: classGroup.id,
        label: classGroup.name,
        courseId: classGroup.courseId,
      })),
  ];
}

function normalizeEvent(event: WorkbenchCalendarEvent) {
  const pending = isRollCallPending(event);
  const isTrial = event.type === 'trial_session';
  return {
    ...event,
    isMine: event.isMine !== false,
    teacherName: event.teacher?.name || '',
    scopeLabel: isTrial
      ? event.isMine !== false
        ? '我的试听'
        : event.teacher?.name || '机构试听'
      : event.isMine !== false
        ? '我的课次'
        : event.teacher?.name || '机构课次',
    dateLabel: dateLabel(event.startsAt),
    timeLabel: timeRange(event.startsAt, event.endsAt),
    className: isTrial ? '试听课' : event.class?.name || '班级',
    courseName: event.course?.name || '课程',
    classroomName: event.classroom?.name || '空间待确认',
    statusLabel: isTrial
      ? TRIAL_SESSION_STATUS_LABEL[event.status] || '试听安排'
      : pending
        ? '未点名'
        : event.status === 'completed'
          ? '已完成'
          : '已排课',
    leaveCount: event.attendanceSummary?.leave ?? 0,
    pending,
    attendanceActionLabel: event.attendanceCount > 0 ? '继续点名' : '点名',
    rollCallActionLabel:
      event.attendanceCount >= event.rosterCount && event.rosterCount > 0
        ? '查看点名'
        : event.attendanceCount > 0
          ? '继续点名'
          : '开始点名',
    showRosterAction:
      event.type === 'class_session' && event.canManageRoster && event.status === 'scheduled',
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
    activeRecordScope: 'pending' as RecordScope,
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
    recordScopeTabs: RECORD_SCOPE_TABS.map((item) => ({
      ...item,
      count: 0,
      className: feedbackScopeClassName('pending', item.key),
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
    rollCallDisplayEvents: [] as Array<ReturnType<typeof normalizeEvent>>,
    pendingRollCall30Count: 0,
    showPendingRollCalls: false,
    rollCallReminderVisible: true,
    recordEvents: [] as Array<
      ReturnType<typeof normalizeEvent> & {
        recordActionLabel: string;
        recordStatusLabel: string;
      }
    >,
    isTrialAdmin: false,
    teacherTrialSessions: [] as TeacherTrialSessionRow[],
    pendingTeacherTrialSessions: [] as TeacherTrialSessionRow[],
    historyTeacherTrialSessions: [] as TeacherTrialSessionRow[],
    displayedTeacherTrialSessions: [] as TeacherTrialSessionRow[],
    activeTrialSessionScope: 'pending' as TrialSessionScope,
    teacherTrialLeads: [] as TeacherTrialLeadRow[],
    trialCourses: [] as Course[],
    trialCampuses: [] as Array<{ id: string; name: string }>,
    trialTeachers: [] as Array<{ id: string; name: string; title?: string | null }>,
    trialScheduleVisible: false,
    trialScheduleSaving: false,
    trialScheduleError: '',
    trialScheduleLeadId: '',
    trialScheduleCourseIndex: 0,
    trialScheduleCampusIndex: 0,
    trialScheduleTeacherIndex: 0,
    trialScheduleForm: {
      title: '',
      date: dateInputValue(addDays(new Date(), 1)),
      startsAt: '16:00',
      endsAt: '17:00',
    },
    dateStripDays: [] as DateStripRow[],
    rollCallDateStripDays: [] as DateStripRow[],
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
    filteredClasses: [] as Array<
      ReturnType<typeof normalizeClass> & {
        sessionCount: number;
        upcomingSessionCount: number;
      }
    >,
    classSearchKeyword: '',
    classCampusFilterIndex: 0,
    classTeacherFilterIndex: 0,
    classStatusFilterIndex: 0,
    classCampusFilterOptions: [{ id: '', label: '全部校区' }] as StudentFilterOption[],
    classTeacherFilterOptions: [{ id: '', label: '全部老师' }] as StudentFilterOption[],
    classStatusFilterOptions: CLASS_FILTER_OPTIONS,
    classUnscheduledCount: 0,
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
    canCreateAcademicRecords: false,
    schedulingOptions: null as TeacherSchedulingOptions | null,
    studentCreateVisible: false,
    studentCreateSaving: false,
    studentCreateError: '',
    studentCreateForm: { ...EMPTY_STUDENT_CREATE_FORM } as StudentCreateForm,
    contractCreateVisible: false,
    contractCreateSaving: false,
    contractCreateError: '',
    contractForm: { ...EMPTY_CONTRACT_CREATE_FORM } as ContractCreateForm,
    contractStudentOptions: [] as ContractStudentOption[],
    contractFilteredStudentOptions: [] as ContractStudentOption[],
    contractStudentKeyword: '',
    contractStudentId: '',
    contractStudentName: '',
    contractCourseOptions: [{ id: '', label: '选择课程' }] as ContractCourseOption[],
    contractPackageOptions: [
      { id: '', label: '自定义课时', lessonCount: 0, priceAmount: 0 },
    ] as ContractPackageOption[],
    contractClassOptions: [{ id: '', label: '暂不入班' }] as ContractClassOption[],
    contractStudentIndex: 0,
    contractCourseIndex: 0,
    contractPackageIndex: 0,
    contractClassIndex: 0,
    paymentMethodOptions: PAYMENT_METHOD_OPTIONS,
    paymentMethodIndex: 0,
    feedbackEvents: [] as Array<
      ReturnType<typeof normalizeEvent> & {
        feedbackCount: number;
        interactionActionLabel: string;
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
    calendarEvents: [] as WorkbenchCalendarEvent[],
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
    canCreateAdHocSession: false,
    canManageClasses: false,
  },

  lifetimes: {
    attached() {
      this.reload();
    },
  },

  methods: {
    requestRoleSwitch() {
      if (this.data.switchingRole) return;
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
          schedulingOptions,
          trialWorkbench,
        ] = await Promise.all([
          fetchTeacherDashboard(),
          fetchTeacherCalendar(calendarRange()),
          fetchTeacherHomeworkCheckIns(),
          fetchTeacherLessonFeedbacks(),
          fetchTeacherHomeworkAssignments(),
          fetchTeacherNotifications({ status: 'unread', limit: 20 }),
          fetchTeacherCapabilities(),
          fetchTeacherSchedulingOptions(),
          fetchTeacherTrialWorkbench(),
        ]);
        const today = startOfDay(new Date());
        const selectedDateKey = this.data.selectedDateKey || dateKey(today);
        const dashboardClasses = Array.isArray(dashboard.classes) ? dashboard.classes : [];
        const calendarItems: WorkbenchCalendarEvent[] = Array.isArray(calendarEvents)
          ? calendarEvents.map((event) => ({
              ...event,
              canOperate: event.isMine !== false || capabilities.isAdminTeacher,
              canManageRoster:
                (event.isMine !== false || capabilities.isAdminTeacher) &&
                capabilities.permissions.manageSessionRoster,
            }))
          : [];
        const homeworkItems = Array.isArray(homeworkCheckIns) ? homeworkCheckIns : [];
        const feedbackItems = Array.isArray(lessonFeedbacks) ? lessonFeedbacks : [];
        const assignmentItems = Array.isArray(homeworkAssignments) ? homeworkAssignments : [];
        const notificationItems = Array.isArray(teacherNotifications) ? teacherNotifications : [];
        const trialCourseById = new Map(
          (trialWorkbench.courses ?? []).map((course) => [course.id, course]),
        );
        const trialCampusById = new Map(
          (trialWorkbench.campuses ?? []).map((campus) => [campus.id, campus]),
        );
        const trialTeacherById = new Map(
          (trialWorkbench.teachers ?? []).map((teacher) => [teacher.id, teacher]),
        );
        const teacherTrialSessions = (trialWorkbench.sessions ?? []).map((session) => {
          const familyConfirmed = session.bookedCount > 0;
          const confirmationLabel =
            session.sessionMode === 'private_invite'
              ? familyConfirmed
                ? '家长已确认'
                : '待家长确认'
              : session.sessionMode === 'lead_scheduled'
                ? '已约试听'
                : `已预约 ${session.bookedCount}/${session.capacity}`;
          return {
            ...session,
            dateLabel: dateLabel(session.startsAt),
            timeLabel: timeRange(session.startsAt, session.endsAt),
            courseName:
              session.course?.name || trialCourseById.get(session.courseId)?.name || '试听课程',
            campusName:
              session.campus?.name || trialCampusById.get(session.campusId)?.name || '校区待确认',
            teacherName:
              session.teacher?.name ||
              (session.teacherId ? trialTeacherById.get(session.teacherId)?.name : '') ||
              '老师待安排',
            statusLabel: TRIAL_SESSION_STATUS_LABEL[session.status] || '试听安排',
            confirmationLabel,
            confirmationClassName:
              familyConfirmed || session.sessionMode === 'lead_scheduled'
                ? 'teacher-trial-confirmation confirmed'
                : 'teacher-trial-confirmation pending',
          };
        });
        const pendingTeacherTrialSessions = teacherTrialSessions.filter(
          (session) => session.status === 'scheduled',
        );
        const historyTeacherTrialSessions = teacherTrialSessions.filter(
          (session) => session.status !== 'scheduled',
        );
        const teacherTrialLeads = (trialWorkbench.leads ?? []).map((lead) => ({
          ...lead,
          courseName: lead.courseId
            ? trialCourseById.get(lead.courseId)?.name || '课程待确认'
            : '课程待确认',
          campusName: lead.campusId
            ? trialCampusById.get(lead.campusId)?.name || '校区待确认'
            : '校区待确认',
          teacherName: lead.preferredTeacherId
            ? trialTeacherById.get(lead.preferredTeacherId)?.name || '老师待安排'
            : '老师待安排',
          statusLabel: TRIAL_LEAD_STATUS_LABEL[lead.status] || lead.status,
          createdLabel: formatDateTime(lead.createdAt),
        }));
        const now = Date.now();
        const normalizedClasses = dashboardClasses.map((classGroup) => {
          const normalized = normalizeClass(classGroup);
          const classSessions = calendarItems.filter(
            (event) => event.class?.id === classGroup.id && event.status !== 'cancelled',
          );
          return {
            ...normalized,
            sessionCount: classSessions.length,
            upcomingSessionCount: classSessions.filter(
              (event) => new Date(event.startsAt).getTime() >= now,
            ).length,
          };
        });
        const studentRows = this.buildStudentRows(
          dashboard.students,
          dashboardClasses,
        ) as StudentRow[];
        const classFilterOptions = buildStudentClassFilterOptions(normalizedClasses);
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
        const classTeacherOptionMap = new Map<string, string>();
        for (const classGroup of normalizedClasses) {
          if (classGroup.teacher?.id) {
            classTeacherOptionMap.set(classGroup.teacher.id, classGroup.teacher.name);
          }
        }
        const classTeacherFilterOptions: StudentFilterOption[] = [
          { id: '', label: '全部老师' },
          ...Array.from(classTeacherOptionMap, ([id, label]) => ({ id, label })),
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
        const contractCourseOptions = buildContractCourseOptions(schedulingOptions.courses ?? []);
        this.setData({
          loading: false,
          canCreateAcademicRecords: Boolean(capabilities.isAdminTeacher),
          schedulingOptions,
          isTrialAdmin: Boolean(trialWorkbench.isAdminTeacher),
          teacherTrialSessions,
          pendingTeacherTrialSessions,
          historyTeacherTrialSessions,
          displayedTeacherTrialSessions:
            this.data.activeTrialSessionScope === 'history'
              ? historyTeacherTrialSessions
              : pendingTeacherTrialSessions,
          teacherTrialLeads,
          trialCourses: trialWorkbench.courses ?? [],
          trialCampuses: trialWorkbench.campuses ?? [],
          trialTeachers: trialWorkbench.teachers ?? [],
          calendarEvents: calendarItems,
          classes: normalizedClasses,
          filteredClasses: normalizedClasses,
          classSearchKeyword: '',
          classCampusFilterIndex: 0,
          classTeacherFilterIndex: 0,
          classStatusFilterIndex: 0,
          classCampusFilterOptions: campusFilterOptions,
          classTeacherFilterOptions,
          classUnscheduledCount: normalizedClasses.filter(
            (item) =>
              ['recruiting', 'active'].includes(item.status) && item.upcomingSessionCount === 0,
          ).length,
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
          contractStudentOptions: buildContractStudentOptions(studentRows),
          contractFilteredStudentOptions: buildContractStudentOptions(studentRows),
          contractStudentKeyword: '',
          contractStudentId: '',
          contractStudentName: '',
          contractCourseOptions,
          contractPackageOptions: buildContractPackageOptions(
            schedulingOptions.coursePackages ?? [],
            null,
          ),
          contractClassOptions: buildContractClassOptions(schedulingOptions.classes ?? []),
          lessonFeedbacks: feedbackItems,
          homeworkAssignments: assignmentItems,
          teacherNotifications: notificationItems.map(normalizeTeacherNotification),
          pendingAttentionCount: notificationItems.filter((item) => item.status === 'unread')
            .length,
          canSchedule:
            capabilities.permissions.createClassSession ||
            capabilities.permissions.createAdHocSession,
          canCreateAdHocSession: capabilities.permissions.createAdHocSession,
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
        this.applyClassFilters();
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
        if (campusId && !student.classes.some((classGroup) => classGroup.campusId === campusId)) {
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
      const campusIndex = Number(event.detail.value) || 0;
      const campusOptions = this.data.studentCampusFilterOptions as StudentFilterOption[];
      const classes = this.data.classes as Array<ReturnType<typeof normalizeClass>>;
      const currentClassOptions = this.data.studentClassFilterOptions as StudentFilterOption[];
      const currentClassId = currentClassOptions[this.data.studentClassFilterIndex]?.id || '';
      const campusId = campusOptions[campusIndex]?.id || '';
      const nextClassOptions = buildStudentClassFilterOptions(classes, campusId);
      const nextClassIndex = Math.max(
        0,
        nextClassOptions.findIndex((option) => option.id === currentClassId),
      );
      this.setData({
        studentCampusFilterIndex: campusIndex,
        studentClassFilterOptions: nextClassOptions,
        studentClassFilterIndex: nextClassIndex,
      });
      this.applyStudentFilters(true);
    },

    onStudentClassFilterChange(event: MiniPickerEvent) {
      const classIndex = Number(event.detail.value) || 0;
      const classOptions = this.data.studentClassFilterOptions as StudentFilterOption[];
      const selectedClass = classOptions[classIndex];
      if (!selectedClass?.id) {
        this.setData({ studentClassFilterIndex: 0 });
        this.applyStudentFilters(true);
        return;
      }

      const campusOptions = this.data.studentCampusFilterOptions as StudentFilterOption[];
      const classes = this.data.classes as Array<ReturnType<typeof normalizeClass>>;
      const campusId = selectedClass.campusId || '';
      const campusIndex = Math.max(
        0,
        campusOptions.findIndex((option) => option.id === campusId),
      );
      const nextClassOptions = buildStudentClassFilterOptions(classes, campusId);
      const nextClassIndex = Math.max(
        0,
        nextClassOptions.findIndex((option) => option.id === selectedClass.id),
      );
      this.setData({
        studentCampusFilterIndex: campusIndex,
        studentClassFilterOptions: nextClassOptions,
        studentClassFilterIndex: nextClassIndex,
      });
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
        studentClassFilterOptions: buildStudentClassFilterOptions(
          this.data.classes as Array<ReturnType<typeof normalizeClass>>,
        ),
        studentCourseFilterIndex: 0,
        studentLessonFilterIndex: 0,
      });
      this.applyStudentFilters(true);
    },

    openStudentCreate() {
      if (!this.data.canCreateAcademicRecords) return;
      this.setData({
        studentCreateVisible: true,
        studentCreateSaving: false,
        studentCreateError: '',
        studentCreateForm: { ...EMPTY_STUDENT_CREATE_FORM },
      });
    },

    closeStudentCreate() {
      if (this.data.studentCreateSaving) return;
      this.setData({
        studentCreateVisible: false,
        studentCreateError: '',
      });
    },

    onStudentCreateInput(event: MiniInputEvent) {
      const field = event.currentTarget.dataset.field as keyof StudentCreateForm;
      if (!field) return;
      this.setData({
        studentCreateForm: {
          ...(this.data.studentCreateForm as StudentCreateForm),
          [field]: event.detail.value,
        },
      });
    },

    async submitStudentCreate() {
      const form = this.data.studentCreateForm as StudentCreateForm;
      const name = form.name.trim();
      const grade = form.grade.trim();
      const guardianName = form.guardianName.trim();
      const guardianPhone = form.guardianPhone.trim();
      if (!name || !grade) {
        this.setData({ studentCreateError: '请填写学员姓名和年级' });
        return;
      }
      if ((guardianName && !guardianPhone) || (!guardianName && guardianPhone)) {
        this.setData({ studentCreateError: '家长姓名和手机号需同时填写' });
        return;
      }
      this.setData({ studentCreateSaving: true, studentCreateError: '' });
      try {
        await createTeacherStudent({
          name,
          grade,
          school: form.school.trim() || undefined,
          guardianName: guardianName || undefined,
          guardianPhone: guardianPhone || undefined,
        });
        wx.showToast({ title: '学员档案已新增', icon: 'success' });
        this.setData({
          studentCreateVisible: false,
          studentCreateForm: { ...EMPTY_STUDENT_CREATE_FORM },
        });
        await this.reload();
      } catch (error) {
        this.setData({
          studentCreateError: error instanceof Error ? error.message : '新增学员失败',
        });
      } finally {
        this.setData({ studentCreateSaving: false });
      }
    },

    openContractCreate() {
      if (!this.data.canCreateAcademicRecords) return;
      const schedulingOptions = this.data.schedulingOptions as TeacherSchedulingOptions | null;
      const contractCourseOptions = buildContractCourseOptions(schedulingOptions?.courses ?? []);
      const contractStudentOptions = buildContractStudentOptions(
        this.data.allStudents as StudentRow[],
      );
      const contractCourseIndex = contractCourseOptions.length > 1 ? 1 : 0;
      const selectedCourseId = contractCourseOptions[contractCourseIndex]?.id || '';
      const selectedCourse =
        schedulingOptions?.courses.find((course) => course.id === selectedCourseId) ?? null;
      const contractPackageOptions = buildContractPackageOptions(
        schedulingOptions?.coursePackages ?? [],
        selectedCourse,
      );
      const contractPackageIndex = contractPackageOptions.length > 1 ? 1 : 0;
      const contractForm = {
        ...EMPTY_CONTRACT_CREATE_FORM,
        ...packageFormPatch(
          contractPackageOptions[contractPackageIndex],
          EMPTY_CONTRACT_CREATE_FORM,
        ),
      };
      this.setData({
        contractCreateVisible: true,
        contractCreateSaving: false,
        contractCreateError: '',
        contractForm,
        contractStudentOptions,
        contractFilteredStudentOptions: contractStudentOptions,
        contractStudentKeyword: '',
        contractStudentId: '',
        contractStudentName: '',
        contractCourseOptions,
        contractPackageOptions,
        contractClassOptions: buildContractClassOptions(
          schedulingOptions?.classes ?? [],
          selectedCourseId,
        ),
        contractStudentIndex: 0,
        contractCourseIndex,
        contractPackageIndex,
        contractClassIndex: 0,
        paymentMethodIndex: 0,
      });
    },

    closeContractCreate() {
      if (this.data.contractCreateSaving) return;
      this.setData({
        contractCreateVisible: false,
        contractCreateError: '',
      });
    },

    onContractStudentChange(event: MiniPickerEvent) {
      this.setData({ contractStudentIndex: Number(event.detail.value) || 0 });
    },

    onContractStudentSearchInput(event: MiniInputEvent) {
      const keyword = event.detail.value;
      this.setData({ contractStudentKeyword: keyword });
      this.filterContractStudents(keyword);
    },

    filterContractStudents(keywordValue = this.data.contractStudentKeyword) {
      const keyword = String(keywordValue || '')
        .trim()
        .toLocaleLowerCase('zh-CN');
      const options = this.data.contractStudentOptions as ContractStudentOption[];
      this.setData({
        contractFilteredStudentOptions: options.filter(
          (student) => !keyword || student.searchText.includes(keyword),
        ),
      });
    },

    selectContractStudent(event: MiniTapEvent) {
      const studentId = String(event.currentTarget.dataset.id || '');
      if (!studentId) return;
      const student = (this.data.contractStudentOptions as ContractStudentOption[]).find(
        (item) => item.id === studentId,
      );
      this.setData({
        contractStudentId: studentId,
        contractStudentName: student?.label || '',
        contractStudentKeyword: student?.label || '',
      });
      this.filterContractStudents(student?.label || '');
    },

    onContractCourseChange(event: MiniPickerEvent) {
      const courseIndex = Number(event.detail.value) || 0;
      const schedulingOptions = this.data.schedulingOptions as TeacherSchedulingOptions | null;
      const courseOptions = this.data.contractCourseOptions as ContractCourseOption[];
      const selectedCourseId = courseOptions[courseIndex]?.id || '';
      const selectedCourse =
        schedulingOptions?.courses.find((course) => course.id === selectedCourseId) ?? null;
      const packageOptions = buildContractPackageOptions(
        schedulingOptions?.coursePackages ?? [],
        selectedCourse,
      );
      const packageIndex = packageOptions.length > 1 ? 1 : 0;
      const formPatch = packageOptions[packageIndex]?.id
        ? packageFormPatch(
            packageOptions[packageIndex],
            this.data.contractForm as ContractCreateForm,
          )
        : { title: '', lessonCount: '', paidYuan: '' };
      this.setData({
        contractCourseIndex: courseIndex,
        contractPackageOptions: packageOptions,
        contractClassOptions: buildContractClassOptions(
          schedulingOptions?.classes ?? [],
          selectedCourseId,
        ),
        contractPackageIndex: packageIndex,
        contractClassIndex: 0,
        contractForm: {
          ...(this.data.contractForm as ContractCreateForm),
          ...formPatch,
        },
      });
    },

    onContractPackageChange(event: MiniPickerEvent) {
      const packageIndex = Number(event.detail.value) || 0;
      const packageOptions = this.data.contractPackageOptions as ContractPackageOption[];
      const selectedPackage = packageOptions[packageIndex];
      const patch = packageFormPatch(selectedPackage, this.data.contractForm as ContractCreateForm);
      this.setData({
        contractPackageIndex: packageIndex,
        contractForm: {
          ...(this.data.contractForm as ContractCreateForm),
          ...patch,
        },
      });
    },

    onContractDateChange(event: MiniPickerEvent) {
      const field = event.currentTarget.dataset.field as 'startsAt' | 'endsAt' | undefined;
      if (!field) return;
      const packageOptions = this.data.contractPackageOptions as ContractPackageOption[];
      const selectedPackage = packageOptions[this.data.contractPackageIndex];
      const value = String(event.detail.value || '');
      this.setData({
        contractForm: {
          ...(this.data.contractForm as ContractCreateForm),
          [field]: value,
          ...(field === 'startsAt' && selectedPackage?.billingType === 'period'
            ? { endsAt: periodEndDateKey(value, selectedPackage) }
            : {}),
        },
      });
    },

    onContractClassChange(event: MiniPickerEvent) {
      this.setData({ contractClassIndex: Number(event.detail.value) || 0 });
    },

    onContractPaymentMethodChange(event: MiniPickerEvent) {
      const paymentMethodIndex = Number(event.detail.value) || 0;
      const method =
        PAYMENT_METHOD_OPTIONS[paymentMethodIndex]?.value ??
        EMPTY_CONTRACT_CREATE_FORM.paymentMethod;
      this.setData({
        paymentMethodIndex,
        contractForm: {
          ...(this.data.contractForm as ContractCreateForm),
          paymentMethod: method,
        },
      });
    },

    onContractInput(event: MiniInputEvent) {
      const field = event.currentTarget.dataset.field as keyof ContractCreateForm;
      if (!field) return;
      this.setData({
        contractForm: {
          ...(this.data.contractForm as ContractCreateForm),
          [field]: event.detail.value,
        },
      });
    },

    async submitContractCreate() {
      const courseOptions = this.data.contractCourseOptions as ContractCourseOption[];
      const packageOptions = this.data.contractPackageOptions as ContractPackageOption[];
      const classOptions = this.data.contractClassOptions as ContractClassOption[];
      const form = this.data.contractForm as ContractCreateForm;
      const studentId = this.data.contractStudentId || '';
      const courseId = courseOptions[this.data.contractCourseIndex]?.id || '';
      const packageId = packageOptions[this.data.contractPackageIndex]?.id || '';
      const classId = classOptions[this.data.contractClassIndex]?.id || '';
      const lessonCount = Number(form.lessonCount);
      const paidYuan = Number(form.paidYuan || 0);
      if (!studentId || !courseId) {
        this.setData({ contractCreateError: '请选择学员和课程' });
        return;
      }
      if (!Number.isInteger(lessonCount) || lessonCount <= 0) {
        this.setData({ contractCreateError: '课时数必须大于 0' });
        return;
      }
      if (!Number.isFinite(paidYuan) || paidYuan < 0) {
        this.setData({ contractCreateError: '实收金额不能小于 0' });
        return;
      }
      this.setData({ contractCreateSaving: true, contractCreateError: '' });
      try {
        await createTeacherCourseContract({
          studentId,
          courseId,
          classId: classId || null,
          packageId: packageId || null,
          title: form.title.trim() || null,
          lessonCount,
          paidAmount: Math.round(paidYuan * 100),
          paymentMethod: form.paymentMethod,
          startsAt: dateToApiDateTime(form.startsAt),
          endsAt: dateToApiEndDateTime(form.endsAt),
          note: form.note.trim() || null,
        });
        wx.showToast({ title: '课程档案已创建', icon: 'success' });
        this.setData({
          contractCreateVisible: false,
          contractForm: { ...EMPTY_CONTRACT_CREATE_FORM },
        });
        await this.reload();
      } catch (error) {
        this.setData({
          contractCreateError: error instanceof Error ? error.message : '创建课程档案失败',
        });
      } finally {
        this.setData({ contractCreateSaving: false });
      }
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

    applyClassFilters() {
      const keyword = String(this.data.classSearchKeyword || '')
        .trim()
        .toLocaleLowerCase('zh-CN');
      const campusOptions = this.data.classCampusFilterOptions as StudentFilterOption[];
      const teacherOptions = this.data.classTeacherFilterOptions as StudentFilterOption[];
      const statusOptions = this.data.classStatusFilterOptions as StudentFilterOption[];
      const campusId = campusOptions[this.data.classCampusFilterIndex]?.id || '';
      const teacherId = teacherOptions[this.data.classTeacherFilterIndex]?.id || '';
      const status = statusOptions[this.data.classStatusFilterIndex]?.id || '';
      const filtered = (
        this.data.classes as Array<
          ReturnType<typeof normalizeClass> & {
            sessionCount: number;
            upcomingSessionCount: number;
          }
        >
      ).filter((classGroup) => {
        if (campusId && classGroup.campus?.id !== campusId) return false;
        if (teacherId && classGroup.teacher?.id !== teacherId) return false;
        if (status && classGroup.status !== status) return false;
        if (!keyword) return true;
        return [classGroup.name, classGroup.courseName, classGroup.teacherName]
          .filter(Boolean)
          .some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword));
      });
      this.setData({ filteredClasses: filtered });
    },

    onClassSearchInput(event: MiniInputEvent) {
      this.setData({ classSearchKeyword: event.detail.value });
      this.applyClassFilters();
    },

    onClassCampusFilterChange(event: MiniPickerEvent) {
      this.setData({ classCampusFilterIndex: Number(event.detail.value) || 0 });
      this.applyClassFilters();
    },

    onClassTeacherFilterChange(event: MiniPickerEvent) {
      this.setData({ classTeacherFilterIndex: Number(event.detail.value) || 0 });
      this.applyClassFilters();
    },

    onClassStatusFilterChange(event: MiniPickerEvent) {
      this.setData({ classStatusFilterIndex: Number(event.detail.value) || 0 });
      this.applyClassFilters();
    },

    resetClassFilters() {
      this.setData({
        classSearchKeyword: '',
        classCampusFilterIndex: 0,
        classTeacherFilterIndex: 0,
        classStatusFilterIndex: 0,
      });
      this.applyClassFilters();
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
      const now = new Date();
      const calendarEvents = this.data.calendarEvents as WorkbenchCalendarEvent[];
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
        (event) => event.canOperate && isRollCallPending(event),
      );
      const pendingRollCallStart = addDays(today, -30);
      const pendingRollCallEvents = calendarEvents
        .filter((event) => {
          const startsAt = new Date(event.startsAt);
          return (
            event.type === 'class_session' &&
            event.canOperate &&
            event.status !== 'cancelled' &&
            event.rosterCount > event.attendanceCount &&
            startsAt >= pendingRollCallStart &&
            startsAt <= now
          );
        })
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
        .map(normalizeEvent);
      const pendingRollCall30Count = pendingRollCallEvents.length;
      const dailyRollCallEvents = calendarEvents
        .filter(
          (event) =>
            event.type === 'class_session' &&
            event.canOperate &&
            event.status !== 'cancelled' &&
            dateKey(new Date(event.startsAt)) === this.data.selectedDateKey,
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .map(normalizeEvent);
      const pendingHomeworkCount = homeworkCheckIns.filter(
        (item) => item.reviewStatus === 'submitted' || item.reviewStatus === 'needs_revision',
      ).length;
      const recordRows = calendarEvents
        .filter(
          (event) =>
            event.type === 'class_session' &&
            event.status !== 'cancelled' &&
            (event.status === 'completed' ||
              event.attendanceCount > 0 ||
              new Date(event.endsAt) <= now),
        )
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
        .slice(0, 60)
        .map((event) => {
          const pending = event.rosterCount > event.attendanceCount;
          return {
            ...normalizeEvent(event),
            recordActionLabel: pending ? '补充点名' : '修改记录',
            recordStatusLabel: pending ? '待完善' : '已完成',
          };
        });
      const recordBuckets: Record<RecordScope, typeof recordRows> = {
        pending: recordRows.filter((event) => event.rosterCount > event.attendanceCount),
        history: recordRows.filter((event) => event.rosterCount <= event.attendanceCount),
      };
      const feedbackCountBySession = new Map<string, number>();
      for (const feedback of lessonFeedbacks) {
        feedbackCountBySession.set(
          feedback.classSessionId,
          (feedbackCountBySession.get(feedback.classSessionId) ?? 0) + 1,
        );
      }
      const pendingStart = addDays(today, -14);
      const historyStart = addDays(today, -30);
      const feedbackRows = calendarEvents
        .filter(
          (event) =>
            event.type === 'class_session' &&
            event.status !== 'cancelled' &&
            new Date(event.startsAt) <= now,
        )
        .map((event) => {
          const feedbackCount = feedbackCountBySession.get(event.id) ?? 0;
          const complete = event.rosterCount > 0 && feedbackCount >= event.rosterCount;
          return {
            ...normalizeEvent(event),
            feedbackCount,
            interactionActionLabel: complete
              ? '修改互动'
              : feedbackCount > 0
                ? '继续互动'
                : '开始互动',
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
          return (
            startsAt >= historyStart &&
            startsAt <= now &&
            !sameDate(startsAt, today) &&
            event.rosterCount > 0 &&
            event.feedbackCount >= event.rosterCount
          );
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
      const activeRecordScope = this.data.activeRecordScope as RecordScope;
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
        recordScopeTabs: RECORD_SCOPE_TABS.map((item) => ({
          ...item,
          count: recordBuckets[item.key].length,
          className: feedbackScopeClassName(activeRecordScope, item.key),
        })),
        summaryTitle: summaryTitle(this.data.metricScope),
        stats: {
          courseCount: metricEvents.filter((event) => event.status !== 'cancelled').length,
          pendingRollCall: metricEvents.filter(
            (event) => event.canOperate && isRollCallPending(event),
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
        rollCallEvents: dailyRollCallEvents,
        rollCallDisplayEvents: this.data.showPendingRollCalls
          ? pendingRollCallEvents
          : dailyRollCallEvents,
        pendingRollCall30Count,
        recordEvents: recordBuckets[activeRecordScope],
        selectedEvents: calendarEvents
          .filter((event) => dateKey(new Date(event.startsAt)) === this.data.selectedDateKey)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          .map(normalizeEvent),
        dateStripDays: buildDateStripRows(dateStripDays, calendarEvents, this.data.selectedDateKey),
        rollCallDateStripDays: buildDateStripRows(
          dateStripDays,
          calendarEvents.filter(
            (event) =>
              event.type === 'class_session' && event.canOperate && event.status !== 'cancelled',
          ),
          this.data.selectedDateKey,
        ),
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
      this.setData({
        activeView: key,
        ...(key === 'rollcall'
          ? {
              selectedDateKey: dateKey(startOfDay(new Date())),
              visibleDateKey: dateKey(startOfDay(new Date())),
              calendarExpanded: false,
              showPendingRollCalls: false,
            }
          : {}),
      });
      this.recompute();
    },

    dismissRollCallReminder() {
      this.setData({ rollCallReminderVisible: false });
    },

    showPendingRollCallList() {
      this.setData({ showPendingRollCalls: true });
      this.recompute();
    },

    showRollCallCalendar() {
      this.setData({ showPendingRollCalls: false });
      this.recompute();
    },

    goToTodayRollCall() {
      const todayKey = dateKey(startOfDay(new Date()));
      this.setData({
        selectedDateKey: todayKey,
        visibleDateKey: todayKey,
        showPendingRollCalls: false,
      });
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
      if (action === 'rollcall') {
        const todayKey = dateKey(startOfDay(new Date()));
        this.setData({
          activeView: 'rollcall',
          selectedDateKey: todayKey,
          visibleDateKey: todayKey,
          calendarExpanded: false,
          showPendingRollCalls: false,
        });
        this.recompute();
        return;
      }
      if (action === 'leave' || action === 'schedule') {
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

    switchRecordScope(event: MiniTapEvent) {
      const key = event.currentTarget.dataset.key as RecordScope;
      if (key !== 'pending' && key !== 'history') return;
      this.setData({ activeRecordScope: key });
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
            statusLabel: record ? ATTENDANCE_STATUS_LABEL[record.status] : '待点名',
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
        wx.showToast({ title: '已完成点名', icon: 'none' });
        return;
      }
      this.setData({ rollCallSaving: true, rollCallError: '' });
      try {
        await recordTeacherAttendance(session.id, records);
        wx.showToast({ title: '点名已保存', icon: 'success' });
        this.setData({ rollCallVisible: false });
        await this.reload();
      } catch (error) {
        this.setData({ rollCallError: error instanceof Error ? error.message : '点名保存失败' });
      } finally {
        this.setData({ rollCallSaving: false });
      }
    },

    openFeedback(event: MiniTapEvent) {
      const sessionId = String(event.currentTarget.dataset.id || '');
      const calendarEvent = this.findCalendarEvent(sessionId);
      if (!sessionId || !calendarEvent?.canOperate) return;
      wx.navigateTo({
        url: `/pages/teacher-feedback/index?sessionId=${encodeURIComponent(sessionId)}`,
      });
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

    openTrialInviteEditor() {
      if (!this.data.isTrialAdmin) return;
      wx.navigateTo({ url: '/pages/teacher-trial-invite/index' });
    },

    switchTrialSessionScope(event: MiniTapEvent) {
      const scope = String(event.currentTarget.dataset.scope || '');
      if (scope !== 'pending' && scope !== 'history') return;
      this.setData({
        activeTrialSessionScope: scope,
        displayedTeacherTrialSessions:
          scope === 'history'
            ? this.data.historyTeacherTrialSessions
            : this.data.pendingTeacherTrialSessions,
      });
    },

    openTrialSessionEditor(event: MiniTapEvent) {
      if (!this.data.isTrialAdmin || this.data.activeTrialSessionScope !== 'pending') return;
      const sessionId = String(event.currentTarget.dataset.id || '');
      if (!sessionId) return;
      wx.navigateTo({
        url: `/pages/teacher-trial-invite/index?sessionId=${encodeURIComponent(sessionId)}`,
      });
    },

    openTrialLeadSchedule(event: MiniTapEvent) {
      if (!this.data.isTrialAdmin) return;
      const leadId = String(event.currentTarget.dataset.id || '');
      const lead = (this.data.teacherTrialLeads as TeacherTrialLeadRow[]).find(
        (item) => item.id === leadId,
      );
      if (!lead) return;
      const courses = this.data.trialCourses as Course[];
      const campuses = this.data.trialCampuses as Array<{ id: string; name: string }>;
      const teachers = this.data.trialTeachers as Array<{ id: string; name: string }>;
      if (!courses.length || !campuses.length || !teachers.length) {
        wx.showToast({ title: '请先配置课程、校区和授课老师', icon: 'none' });
        return;
      }
      const courseIndex = Math.max(
        0,
        courses.findIndex((course) => course.id === lead.courseId),
      );
      const campusIndex = Math.max(
        0,
        campuses.findIndex((campus) => campus.id === lead.campusId),
      );
      const teacherIndex = Math.max(
        0,
        teachers.findIndex((teacher) => teacher.id === lead.preferredTeacherId),
      );
      const selectedCourse = courses[courseIndex];
      this.setData({
        trialScheduleVisible: true,
        trialScheduleError: '',
        trialScheduleLeadId: lead.id,
        trialScheduleCourseIndex: courseIndex,
        trialScheduleCampusIndex: campusIndex,
        trialScheduleTeacherIndex: teacherIndex,
        trialScheduleForm: {
          title: `${lead.studentName}试听 · ${selectedCourse?.name || '试听课程'}`,
          date: dateInputValue(addDays(new Date(), 1)),
          startsAt: '16:00',
          endsAt: '17:00',
        },
      });
    },

    closeTrialSchedule() {
      if (this.data.trialScheduleSaving) return;
      this.setData({
        trialScheduleVisible: false,
        trialScheduleError: '',
        trialScheduleLeadId: '',
      });
    },

    onTrialScheduleInput(event: MiniInputEvent) {
      const field = String(event.currentTarget.dataset.field || '');
      if (!['title', 'date', 'startsAt', 'endsAt'].includes(field)) return;
      this.setData({ [`trialScheduleForm.${field}`]: event.detail.value });
    },

    onTrialScheduleCourseChange(event: MiniPickerEvent) {
      const index = Number(event.detail.value) || 0;
      const courses = this.data.trialCourses as Course[];
      const lead = (this.data.teacherTrialLeads as TeacherTrialLeadRow[]).find(
        (item) => item.id === this.data.trialScheduleLeadId,
      );
      this.setData({
        trialScheduleCourseIndex: index,
        'trialScheduleForm.title': `${lead?.studentName || '学员'}试听 · ${
          courses[index]?.name || '试听课程'
        }`,
      });
    },

    onTrialScheduleCampusChange(event: MiniPickerEvent) {
      this.setData({ trialScheduleCampusIndex: Number(event.detail.value) || 0 });
    },

    onTrialScheduleTeacherChange(event: MiniPickerEvent) {
      this.setData({ trialScheduleTeacherIndex: Number(event.detail.value) || 0 });
    },

    async submitTrialSchedule() {
      if (this.data.trialScheduleSaving || !this.data.trialScheduleLeadId) return;
      const courses = this.data.trialCourses as Course[];
      const campuses = this.data.trialCampuses as Array<{ id: string; name: string }>;
      const teachers = this.data.trialTeachers as Array<{ id: string; name: string }>;
      const course = courses[this.data.trialScheduleCourseIndex];
      const campus = campuses[this.data.trialScheduleCampusIndex];
      const teacher = teachers[this.data.trialScheduleTeacherIndex];
      const form = this.data.trialScheduleForm;
      if (
        !course ||
        !campus ||
        !teacher ||
        !form.title.trim() ||
        !form.date ||
        !form.startsAt ||
        !form.endsAt
      ) {
        this.setData({ trialScheduleError: '请完整选择课程、校区、老师和试听时间' });
        return;
      }
      this.setData({ trialScheduleSaving: true, trialScheduleError: '' });
      try {
        await scheduleTeacherTrialLead(this.data.trialScheduleLeadId, {
          courseId: course.id,
          campusId: campus.id,
          teacherId: teacher.id,
          title: form.title.trim(),
          startsAt: localDateTime(form.date, form.startsAt),
          endsAt: localDateTime(form.date, form.endsAt),
        });
        this.setData({
          trialScheduleVisible: false,
          trialScheduleLeadId: '',
        });
        wx.showToast({ title: '试听课次已创建', icon: 'success' });
        await this.reload();
      } catch (error) {
        this.setData({
          trialScheduleError: error instanceof Error ? error.message : '创建试听课次失败',
        });
      } finally {
        this.setData({ trialScheduleSaving: false });
      }
    },

    callTrialLead(event: MiniTapEvent) {
      const phone = String(event.currentTarget.dataset.phone || '');
      if (!phone) return;
      (wx as PhoneWx).makePhoneCall({
        phoneNumber: phone,
        fail: () => wx.showToast({ title: '未能发起电话', icon: 'none' }),
      });
    },

    openScheduleCreate() {
      wx.navigateTo({ url: '/pages/teacher-schedule-create/index' });
    },

    openSessionEdit(event: MiniTapEvent) {
      const sessionId = String(event.currentTarget.dataset.id || '');
      const eventType = String(event.currentTarget.dataset.type || 'class_session');
      if (!sessionId) return;
      if (eventType === 'trial_session') {
        this.setData({ activeView: 'trials' });
        this.recompute();
        return;
      }
      wx.navigateTo({
        url: `/pages/teacher-schedule-create/index?sessionId=${encodeURIComponent(sessionId)}`,
      });
    },

    openSessionRoster(event: MiniTapEvent) {
      const sessionId = String(event.currentTarget.dataset.id || '');
      if (!sessionId) return;
      wx.navigateTo({
        url: `/pages/teacher-schedule-create/index?sessionId=${encodeURIComponent(
          sessionId,
        )}&focus=students`,
      });
    },

    openRollCallDetail(event: MiniTapEvent) {
      const sessionId = String(event.currentTarget.dataset.id || '');
      if (!sessionId) return;
      wx.navigateTo({
        url: `/pages/teacher-roll-call/index?sessionId=${encodeURIComponent(sessionId)}`,
      });
    },

    openRecordDetail(event: MiniTapEvent) {
      const sessionId = String(event.currentTarget.dataset.id || '');
      const calendarEvent = this.findCalendarEvent(sessionId);
      if (!sessionId || !calendarEvent?.canOperate) return;
      this.openRollCallDetail(event);
    },

    openDirectRollCall() {
      wx.navigateTo({
        url: '/pages/teacher-schedule-create/index?mode=ad_hoc&afterCreate=attendance',
      });
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
