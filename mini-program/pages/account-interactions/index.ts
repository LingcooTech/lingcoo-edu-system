import {
  fetchParentChildren,
  fetchParentHomeworkAssignments,
  fetchParentHomeworkCheckIns,
  fetchParentLessonFeedbacks,
  hasToken,
  type ParentChild,
} from '../../services/api';
import {
  toHomeworkAssignmentItem,
  toHomeworkItem,
  toLessonFeedbackItem,
  type HomeworkAssignmentItem,
  type HomeworkItem,
  type LessonFeedbackItem,
} from '../../utils/parent-center';

type ActiveTab = 'feedbacks' | 'homework' | 'assignments';

type StudentFilter = {
  id: string;
  label: string;
};

type InteractionStats = {
  monthStars: number;
  feedbackCount: number;
  homeworkCount: number;
  assignmentCount: number;
};

function currentMonthStartsAt() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function isCurrentMonth(value?: string | null) {
  if (!value) return false;
  return new Date(value).getTime() >= currentMonthStartsAt();
}

function sumRatings(items: Array<{ rating?: number | null }>) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.rating || 0)), 0);
}

function emptyStats(): InteractionStats {
  return {
    monthStars: 0,
    feedbackCount: 0,
    homeworkCount: 0,
    assignmentCount: 0,
  };
}

function buildStudentFilters(children: ParentChild[]): StudentFilter[] {
  return children.map((child) => ({
    id: child.id,
    label: child.name,
  }));
}

function classIdsForStudent(children: ParentChild[], studentId: string) {
  const child = children.find((item) => item.id === studentId);
  return new Set((child?.enrollments ?? []).map((enrollment) => enrollment.classId));
}

Page({
  data: {
    loading: true,
    needLogin: false,
    activeTab: 'feedbacks' as ActiveTab,
    selectedStudentId: 'all',
    showStudentFilter: false,
    studentFilters: [] as StudentFilter[],
    stats: emptyStats(),
    feedbacks: [] as LessonFeedbackItem[],
    homework: [] as HomeworkItem[],
    assignments: [] as HomeworkAssignmentItem[],
    visibleFeedbacks: [] as LessonFeedbackItem[],
    visibleHomework: [] as HomeworkItem[],
    visibleAssignments: [] as HomeworkAssignmentItem[],
    children: [] as ParentChild[],
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
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const [children, lessonFeedbacks, homeworkCheckIns, homeworkAssignments] = await Promise.all([
        fetchParentChildren(),
        fetchParentLessonFeedbacks(),
        fetchParentHomeworkCheckIns(),
        fetchParentHomeworkAssignments(),
      ]);
      const feedbacks = lessonFeedbacks.map(toLessonFeedbackItem);
      const homework = homeworkCheckIns.map(toHomeworkItem);
      const assignments = homeworkAssignments.map(toHomeworkAssignmentItem);
      const studentFilters = buildStudentFilters(children);
      const availableStudentIds = new Set(studentFilters.map((student) => student.id));
      const currentSelected = this.data.selectedStudentId as string;
      const selectedStudentId =
        currentSelected === 'all' || availableStudentIds.has(currentSelected)
          ? currentSelected
          : 'all';

      this.setData(
        {
          children,
          feedbacks,
          homework,
          assignments,
          studentFilters,
          selectedStudentId,
          showStudentFilter: studentFilters.length > 1,
          needLogin: false,
          loading: false,
        },
        () => this.rebuildVisible(),
      );
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  rebuildVisible() {
    const selectedStudentId = this.data.selectedStudentId as string;
    const children = this.data.children as ParentChild[];
    const feedbacks = this.data.feedbacks as LessonFeedbackItem[];
    const homework = this.data.homework as HomeworkItem[];
    const assignments = this.data.assignments as HomeworkAssignmentItem[];

    const visibleFeedbacks =
      selectedStudentId === 'all'
        ? feedbacks
        : feedbacks.filter((item) => item.studentId === selectedStudentId);
    const visibleHomework =
      selectedStudentId === 'all'
        ? homework
        : homework.filter((item) => item.studentId === selectedStudentId);
    const selectedClassIds = classIdsForStudent(children, selectedStudentId);
    const visibleAssignments =
      selectedStudentId === 'all'
        ? assignments
        : assignments.filter((item) => {
            if (item.studentId) return item.studentId === selectedStudentId;
            return selectedClassIds.has(item.classId);
          });

    const monthFeedbacks = visibleFeedbacks.filter((item) => isCurrentMonth(item.createdAt));
    const monthHomework = visibleHomework.filter((item) =>
      isCurrentMonth(item.reviewedAt || item.updatedAt),
    );

    this.setData({
      visibleFeedbacks,
      visibleHomework,
      visibleAssignments,
      stats: {
        monthStars: sumRatings(monthFeedbacks) + sumRatings(monthHomework),
        feedbackCount: visibleFeedbacks.length,
        homeworkCount: visibleHomework.length,
        assignmentCount: visibleAssignments.length,
      },
    });
  },

  onSelectStudent(event: { currentTarget: { dataset: { id?: string } } }) {
    this.setData(
      {
        selectedStudentId: event.currentTarget.dataset.id || 'all',
      },
      () => this.rebuildVisible(),
    );
  },

  onTabChange(event: { currentTarget: { dataset: { tab?: ActiveTab } } }) {
    const tab = event.currentTarget.dataset.tab;
    if (!tab) return;
    this.setData({ activeTab: tab });
  },

  onPreviewFeedbackImage(event: {
    currentTarget: { dataset: { url?: string; urls?: string[] } };
  }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },

  onPreviewHomeworkImage(event: {
    currentTarget: { dataset: { url?: string; urls?: string[] } };
  }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },
});
