import {
  fetchTeacherCalendar,
  fetchTeacherDashboard,
  enrollTeacherStudent,
  fetchTeacherStudentClassOptions,
  fetchTeacherHomeworkAssignments,
  fetchTeacherHomeworkCheckIns,
  fetchTeacherLessonFeedbacks,
  fetchTeacherSessionAttendance,
  type AttendanceStatus,
  type HomeworkAssignment,
  type TeacherCalendarEvent,
  type TeacherClass,
  type TeacherClassOption,
} from '../../services/api';

type StudentProfile = {
  id: string;
  name: string;
  grade: string;
  school: string;
  classCount: number;
  totalBalance: number;
  totalStars: number;
};

type ClassRow = {
  id: string;
  name: string;
  courseName: string;
  classroomName: string;
  balance: string;
};

type ClassOptionRow = TeacherClassOption & {
  courseName: string;
  classroomName: string;
  statusLabel: string;
};

type AttendanceRow = {
  id: string;
  dateLabel: string;
  title: string;
  className: string;
  statusLabel: string;
  lessonDelta: number;
};

type FeedbackRow = {
  id: string;
  dateLabel: string;
  courseName: string;
  className: string;
  content: string;
  rating: number;
  ratingLabel: string;
  assignmentContent: string;
};

type HomeworkRow = {
  id: string;
  dateLabel: string;
  title: string;
  statusLabel: string;
  content: string;
  teacherFeedback: string;
  rating: number;
  ratingLabel: string;
};

type ActiveTab = 'overview' | 'attendance' | 'interactions' | 'homework';

const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus | string, string> = {
  present: '到课',
  late: '迟到',
  leave: '请假',
  absent: '缺勤',
  makeup: '补课',
  trial: '试听',
};

const HOMEWORK_STATUS_LABEL: Record<string, string> = {
  submitted: '待批阅',
  reviewed: '已批阅',
  needs_revision: '需订正',
};

const DETAIL_TABS: Array<{ key: ActiveTab; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'attendance', label: '签到' },
  { key: 'interactions', label: '互动' },
  { key: 'homework', label: '作业' },
];

function pad(input: number) {
  return String(input).padStart(2, '0');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function calendarRange() {
  const from = new Date();
  from.setDate(from.getDate() - 365);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setDate(to.getDate() + 30);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function ratingLabel(rating?: number | null) {
  return rating && rating > 0 ? `${rating} 星` : '未评分';
}

function findStudent(classes: TeacherClass[], studentId: string) {
  for (const classGroup of classes) {
    const student = classGroup.students.find((item) => item.id === studentId);
    if (student) return student;
  }
  return null;
}

Page({
  data: {
    loading: true,
    studentId: '',
    courseId: '',
    notificationId: '',
    enrollingClassId: '',
    profile: null as StudentProfile | null,
    activeTab: 'overview' as ActiveTab,
    detailTabs: DETAIL_TABS.map((item) => ({
      ...item,
      className: item.key === 'overview' ? 'detail-tab detail-tab-active' : 'detail-tab',
    })),
    classes: [] as ClassRow[],
    classOptions: [] as ClassOptionRow[],
    attendance: [] as AttendanceRow[],
    feedbacks: [] as FeedbackRow[],
    homework: [] as HomeworkRow[],
  },

  onLoad(query: { studentId?: string; courseId?: string; notificationId?: string; tab?: ActiveTab }) {
    const activeTab = query.tab || 'overview';
    this.setData({
      studentId: query.studentId || '',
      courseId: query.courseId || '',
      notificationId: query.notificationId || '',
      activeTab,
      detailTabs: DETAIL_TABS.map((item) => ({
        ...item,
        className: item.key === activeTab ? 'detail-tab detail-tab-active' : 'detail-tab',
      })),
    });
    this.reload();
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  async reload() {
    const studentId = this.data.studentId;
    if (!studentId) {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少学员信息', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const [
        dashboard,
        calendarEvents,
        homeworkCheckIns,
        lessonFeedbacks,
        homeworkAssignments,
        classOptionsPayload,
      ] = await Promise.all([
        fetchTeacherDashboard(),
        fetchTeacherCalendar(calendarRange()),
        fetchTeacherHomeworkCheckIns(),
        fetchTeacherLessonFeedbacks(),
        fetchTeacherHomeworkAssignments(),
        this.data.courseId
          ? fetchTeacherStudentClassOptions(studentId, { courseId: this.data.courseId })
          : Promise.resolve(null),
      ]);
      const student = findStudent(dashboard.classes, studentId);
      if (!student && !classOptionsPayload?.student) {
        throw new Error('暂无权限查看该学员');
      }

      const classRows = dashboard.classes
        .filter((classGroup) => classGroup.students.some((item) => item.id === studentId))
        .map((classGroup) => {
          const classStudent = classGroup.students.find((item) => item.id === studentId);
          return {
            id: classGroup.id,
            name: classGroup.name,
            courseName: classGroup.course?.name || '课程',
            classroomName: classGroup.classroom?.name || '教室待确认',
            balance:
              classStudent?.lessonBalance === null || classStudent?.lessonBalance === undefined
                ? '-'
                : String(classStudent.lessonBalance),
          };
        });
      const classIds = new Set(classRows.map((item) => item.id));
      const relatedEvents = (calendarEvents as TeacherCalendarEvent[])
        .filter((event) => event.class && classIds.has(event.class.id))
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
        .slice(0, 30);
      const attendancePayloads = await Promise.all(
        relatedEvents.map((event) =>
          fetchTeacherSessionAttendance(event.id).catch(() => ({
            session: event,
            class: event.class,
            roster: [],
            attendanceRecords: [],
          })),
        ),
      );
      const eventById = new Map(relatedEvents.map((event) => [event.id, event]));
      const attendance = attendancePayloads
        .flatMap((payload) =>
          payload.attendanceRecords
            .filter((record) => record.studentId === studentId)
            .map((record) => {
              const event = eventById.get(record.classSessionId);
              return {
                id: record.id,
                dateLabel: event ? formatDateTime(event.startsAt) : '',
                title: event?.title || '课次',
                className: event?.class?.name || payload.class?.name || '班级',
                statusLabel: ATTENDANCE_STATUS_LABEL[record.status] ?? record.status,
                lessonDelta: record.lessonDelta,
              };
            }),
        )
        .filter((item) => item.dateLabel);
      const assignmentBySession = new Map<string, HomeworkAssignment[]>();
      for (const assignment of homeworkAssignments) {
        assignmentBySession.set(assignment.classSessionId, [
          ...(assignmentBySession.get(assignment.classSessionId) ?? []),
          assignment,
        ]);
      }
      const feedbackRows = lessonFeedbacks
        .filter((item) => item.studentId === studentId)
        .slice(0, 20)
        .map((item) => {
          const assignments = assignmentBySession.get(item.classSessionId) ?? [];
          const personal = assignments.find((assignment) => assignment.studentId === studentId);
          const classAssignment = assignments.find((assignment) => !assignment.studentId);
          return {
            id: item.id,
            dateLabel: formatDateTime(item.createdAt),
            courseName: item.course?.name || '课程',
            className: item.class?.name || '班级',
            content: item.content,
            rating: item.rating || 0,
            ratingLabel: ratingLabel(item.rating),
            assignmentContent: (personal ?? classAssignment)?.content || '',
          };
        });
      const homeworkRows = homeworkCheckIns
        .filter((item) => item.studentId === studentId)
        .slice(0, 20)
        .map((item) => ({
          id: item.id,
          dateLabel: formatDateTime(item.createdAt),
          title: item.course?.name || item.title,
          statusLabel: HOMEWORK_STATUS_LABEL[item.reviewStatus] ?? item.reviewStatus,
          content: item.content || '',
          teacherFeedback: item.teacherFeedback || '',
          rating: item.rating || 0,
          ratingLabel: ratingLabel(item.rating),
        }));
      const totalStars =
        feedbackRows.reduce((sum, item) => sum + item.rating, 0) +
        homeworkRows.reduce((sum, item) => sum + item.rating, 0);
      const classOptions =
        classOptionsPayload?.classes.map((item) => ({
          ...item,
          courseName: item.course?.name || '课程',
          classroomName: item.classroom?.name || '教室待确认',
          statusLabel:
            item.disabledReason ||
            (item.status === 'recruiting'
              ? '招生中'
              : item.status === 'active'
                ? '开课中'
                : item.status),
        })) ?? [];
      const profileStudent = student ?? classOptionsPayload!.student;
      const optionBalance = classOptionsPayload?.lessonAccounts.reduce(
        (sum, item) => sum + item.balance,
        0,
      ) ?? 0;

      this.setData({
        loading: false,
        profile: {
          id: profileStudent.id,
          name: profileStudent.name,
          grade: profileStudent.grade,
          school: profileStudent.school || '',
          classCount: classRows.length,
          totalBalance:
            classRows.reduce((sum, item) => sum + (Number(item.balance) || 0), 0) ||
            optionBalance,
          totalStars,
        },
        classes: classRows,
        classOptions,
        attendance,
        feedbacks: feedbackRows,
        homework: homeworkRows,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
    }
  },

  switchTab(event: { currentTarget: { dataset: { key?: ActiveTab } } }) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    this.setData({
      activeTab: key,
      detailTabs: DETAIL_TABS.map((item) => ({
        ...item,
        className: item.key === key ? 'detail-tab detail-tab-active' : 'detail-tab',
      })),
    });
  },

  async enrollStudent(event: { currentTarget: { dataset: { id?: string } } }) {
    const classId = String(event.currentTarget.dataset.id || '');
    if (!classId || this.data.enrollingClassId) return;
    this.setData({ enrollingClassId: classId });
    try {
      await enrollTeacherStudent(this.data.studentId, {
        classId,
        notificationId: this.data.notificationId || undefined,
      });
      wx.showToast({ title: '分班成功', icon: 'success' });
      await this.reload();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '分班失败', icon: 'none' });
    } finally {
      this.setData({ enrollingClassId: '' });
    }
  },
});
