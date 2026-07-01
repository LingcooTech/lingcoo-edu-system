import {
  clearToken,
  fetchMe,
  fetchParentAttendance,
  fetchParentChildren,
  fetchParentHomeworkAssignments,
  fetchParentHomeworkCheckIns,
  fetchParentLessonAccounts,
  fetchParentLessonFeedbacks,
  hasToken,
  type ParentChild,
} from '../../services/api';

type ReportStats = {
  childCount: number;
  totalBalance: number;
  monthStars: number;
  attendanceCount: number;
  homeworkCount: number;
  assignmentCount: number;
  feedbackCount: number;
};

type ChildReport = {
  id: string;
  name: string;
  meta: string;
  balance: number;
  monthStars: number;
  attendanceCount: number;
  homeworkCount: number;
  assignmentCount: number;
  feedbackCount: number;
};

function currentMonthStartsAt() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function isCurrentMonth(value?: string | null) {
  if (!value) return false;
  return new Date(value).getTime() >= currentMonthStartsAt();
}

function emptyStats(): ReportStats {
  return {
    childCount: 0,
    totalBalance: 0,
    monthStars: 0,
    attendanceCount: 0,
    homeworkCount: 0,
    assignmentCount: 0,
    feedbackCount: 0,
  };
}

function childMeta(child: ParentChild) {
  return [child.grade, child.school].filter(Boolean).join(' · ') || '成长成员';
}

function classIdsForStudent(child: ParentChild) {
  return new Set((child.enrollments ?? []).map((enrollment) => enrollment.classId));
}

Page({
  data: {
    loading: true,
    needLogin: false,
    stats: emptyStats(),
    reports: [] as ChildReport[],
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  goLogin() {
    wx.switchTab({ url: '/pages/account/index' });
  },

  async load() {
    if (!hasToken()) {
      this.setData({ loading: false, needLogin: true, stats: emptyStats(), reports: [] });
      return;
    }

    this.setData({ loading: true });
    try {
      const [
        me,
        children,
        lessonAccounts,
        attendance,
        lessonFeedbacks,
        homeworkCheckIns,
        homeworkAssignments,
      ] = await Promise.all([
        fetchMe(),
        fetchParentChildren(),
        fetchParentLessonAccounts(),
        fetchParentAttendance(),
        fetchParentLessonFeedbacks(),
        fetchParentHomeworkCheckIns(),
        fetchParentHomeworkAssignments(),
      ]);

      if (!me.account || me.account.role !== 'parent') {
        clearToken();
        this.setData({ loading: false, needLogin: true, stats: emptyStats(), reports: [] });
        return;
      }

      const reports = children.map((child) => {
        const classIds = classIdsForStudent(child);
        const childLessonAccounts = lessonAccounts.filter((item) => item.studentId === child.id);
        const childFeedbacks = lessonFeedbacks.filter((item) => item.studentId === child.id);
        const childHomework = homeworkCheckIns.filter((item) => item.studentId === child.id);
        const childAssignments = homeworkAssignments.filter((item) => {
          if (item.studentId) return item.studentId === child.id;
          return classIds.has(item.classId);
        });
        const childAttendance = attendance.filter((item) => item.studentId === child.id);
        const monthFeedbackStars = childFeedbacks
          .filter((item) => isCurrentMonth(item.createdAt))
          .reduce((sum, item) => sum + Math.max(0, Number(item.rating || 0)), 0);
        const monthHomeworkStars = childHomework
          .filter((item) => isCurrentMonth(item.reviewedAt || item.updatedAt))
          .reduce((sum, item) => sum + Math.max(0, Number(item.rating || 0)), 0);

        return {
          id: child.id,
          name: child.name,
          meta: childMeta(child),
          balance: childLessonAccounts.reduce((sum, item) => sum + item.balance, 0),
          monthStars: monthFeedbackStars + monthHomeworkStars,
          attendanceCount: childAttendance.length,
          homeworkCount: childHomework.length,
          assignmentCount: childAssignments.length,
          feedbackCount: childFeedbacks.length,
        };
      });

      this.setData({
        loading: false,
        needLogin: false,
        reports,
        stats: {
          childCount: children.length,
          totalBalance: reports.reduce((sum, item) => sum + item.balance, 0),
          monthStars: reports.reduce((sum, item) => sum + item.monthStars, 0),
          attendanceCount: reports.reduce((sum, item) => sum + item.attendanceCount, 0),
          homeworkCount: reports.reduce((sum, item) => sum + item.homeworkCount, 0),
          assignmentCount: reports.reduce((sum, item) => sum + item.assignmentCount, 0),
          feedbackCount: reports.reduce((sum, item) => sum + item.feedbackCount, 0),
        },
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },
});
