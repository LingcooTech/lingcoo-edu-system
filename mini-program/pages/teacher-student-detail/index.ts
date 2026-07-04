import {
  createTeacherStudentWork,
  createTeacherUploadToken,
  fetchTeacherCalendar,
  fetchTeacherDashboard,
  enrollTeacherStudent,
  fetchTeacherStudentClassOptions,
  fetchTeacherHomeworkAssignments,
  fetchTeacherHomeworkCheckIns,
  fetchTeacherLessonFeedbacks,
  fetchTeacherStudentWorks,
  fetchTeacherSessionAttendance,
  type AttendanceStatus,
  type HomeworkAssignment,
  type StudentWork,
  type TeacherCalendarEvent,
  type TeacherClass,
  type TeacherClassOption,
} from '../../services/api';
import { toUserFacingMessage } from '../../utils/user-facing-message';

const MAX_WORK_IMAGES = 9;

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
  courseId: string;
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

type WorkRow = StudentWork & {
  createdAtLabel: string;
  titleLabel: string;
  courseName: string;
  className: string;
  coverUrl: string;
};

type ActiveTab = 'overview' | 'attendance' | 'interactions' | 'homework' | 'works';

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
  { key: 'works', label: '作品' },
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

function toWorkRow(item: StudentWork): WorkRow {
  return {
    ...item,
    createdAtLabel: formatDateTime(item.createdAt),
    titleLabel: item.title || '作品展示',
    courseName: item.course?.name || '课程',
    className: item.class?.name || '',
    coverUrl: item.imageUrls[0] || '',
  };
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
    works: [] as WorkRow[],
    workTitle: '',
    workDescription: '',
    workImages: [] as string[],
    workClassIndex: 0,
    workClassLabels: [] as string[],
    workUploading: false,
    workSubmitting: false,
    maxWorkImages: MAX_WORK_IMAGES,
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
        studentWorks,
      ] = await Promise.all([
        fetchTeacherDashboard(),
        fetchTeacherCalendar(calendarRange()),
        fetchTeacherHomeworkCheckIns(),
        fetchTeacherLessonFeedbacks(),
        fetchTeacherHomeworkAssignments(),
        this.data.courseId
          ? fetchTeacherStudentClassOptions(studentId, { courseId: this.data.courseId })
          : Promise.resolve(null),
        fetchTeacherStudentWorks(),
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
            courseId: classGroup.course?.id || '',
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
                title: event?.title || '场次',
                className: event?.class?.name || payload.class?.name || '班级',
                statusLabel: ATTENDANCE_STATUS_LABEL[record.status] ?? '未知状态',
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
          statusLabel: HOMEWORK_STATUS_LABEL[item.reviewStatus] ?? '未知状态',
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
        works: (studentWorks as StudentWork[])
          .filter((item) => item.studentId === studentId)
          .map(toWorkRow),
        workClassLabels: classRows.length
          ? classRows.map((item) => `${item.name} · ${item.courseName}`)
          : ['不绑定班级'],
        workClassIndex: this.data.workClassIndex >= classRows.length ? 0 : this.data.workClassIndex,
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

  onWorkClassChange(event: { detail: { value?: string | number } }) {
    const index = Number(event.detail.value ?? 0);
    if (!Number.isNaN(index)) {
      this.setData({ workClassIndex: index });
    }
  },

  onWorkTitleInput(event: { detail: { value?: string } }) {
    this.setData({ workTitle: event.detail.value || '' });
  },

  onWorkDescriptionInput(event: { detail: { value?: string } }) {
    this.setData({ workDescription: event.detail.value || '' });
  },

  onChooseWorkImages() {
    const remaining = MAX_WORK_IMAGES - (this.data.workImages as string[]).length;
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传 ${MAX_WORK_IMAGES} 张`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        void this.uploadWorkImages(result.tempFiles.map((file) => file.tempFilePath));
      },
    });
  },

  async uploadWorkImages(filePaths: string[]) {
    if (!filePaths.length) return;
    this.setData({ workUploading: true });
    wx.showLoading({ title: '上传中...', mask: true });
    const uploaded: string[] = [];
    for (const filePath of filePaths) {
      try {
        uploaded.push(await this.uploadOneWorkImage(filePath));
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '图片上传失败', icon: 'none' });
      }
    }
    wx.hideLoading();
    this.setData({
      workImages: [...(this.data.workImages as string[]), ...uploaded],
      workUploading: false,
    });
  },

  uploadOneWorkImage(filePath: string): Promise<string> {
    const filename = filePath.split('/').pop() || 'work.jpg';
    return createTeacherUploadToken(filename).then(
      (token) =>
        new Promise<string>((resolve, reject) => {
          wx.uploadFile({
            url: token.uploadHost,
            filePath,
            name: 'file',
            formData: { token: token.uploadToken, key: token.key },
            success: (result) => {
              if (result.statusCode >= 200 && result.statusCode < 300) {
                resolve(token.publicUrl);
              } else {
                reject(new Error('图片上传失败'));
              }
            },
            fail: (error) => reject(new Error(toUserFacingMessage(error.errMsg, '图片上传失败'))),
          });
        }),
    );
  },

  onPreviewWorkDraft(event: { currentTarget: { dataset: { index?: number } } }) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.workImages as string[];
    if (Number.isNaN(index) || !images[index]) return;
    wx.previewImage({ urls: images, current: images[index] });
  },

  onPreviewWork(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },

  onRemoveWorkImage(event: { currentTarget: { dataset: { index?: number } } }) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;
    const workImages = (this.data.workImages as string[]).slice();
    workImages.splice(index, 1);
    this.setData({ workImages });
  },

  async submitStudentWork() {
    const workImages = this.data.workImages as string[];
    if (!workImages.length) {
      wx.showToast({ title: '请先上传作品图片', icon: 'none' });
      return;
    }
    const classes = this.data.classes as ClassRow[];
    const selectedClass = classes[this.data.workClassIndex] || classes[0] || null;
    this.setData({ workSubmitting: true });
    try {
      const result = await createTeacherStudentWork({
        studentId: this.data.studentId,
        courseId: selectedClass?.courseId || null,
        classId: selectedClass?.id || null,
        title: String(this.data.workTitle || '').trim() || '作品展示',
        description: String(this.data.workDescription || '').trim(),
        imageUrls: workImages,
      });
      this.setData({ workTitle: '', workDescription: '', workImages: [] });
      await this.reload();
      wx.showToast({ title: result.message || '已发布', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '发布失败', icon: 'none' });
    } finally {
      this.setData({ workSubmitting: false });
    }
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
