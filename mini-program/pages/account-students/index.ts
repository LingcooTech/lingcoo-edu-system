import {
  fetchParentChildren,
  fetchParentLessonAccounts,
  hasToken,
  type ParentChild,
} from '../../services/api';
import { toLessonAccountItem, type LessonAccountItem } from '../../utils/parent-center';

type ChildCourseSummary = {
  key: string;
  courseName: string;
  className: string;
  campusName: string;
  teacherName: string;
};

type ChildProfileItem = ParentChild & {
  meta: string;
  statusLabel: string;
  courses: ChildCourseSummary[];
  emptyCourseText: string;
};

function childStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: '正常',
    inactive: '停用',
    archived: '已归档',
  };
  return labels[status] || '未知状态';
}

function childMeta(child: ParentChild): string {
  return [child.grade, child.school].filter(Boolean).join(' · ') || '成长成员';
}

function summarizeChildCourses(
  child: ParentChild,
  lessonItems: LessonAccountItem[],
): ChildCourseSummary[] {
  const courseById = new Map<string, ChildCourseSummary>();
  for (const item of lessonItems) {
    courseById.set(item.courseId, {
      key: item.courseId,
      courseName: item.courseName,
      className: '待分组',
      campusName: '空间待确认',
      teacherName: '导师待确认',
    });
  }

  for (const enrollment of child.enrollments ?? []) {
    const courseId = enrollment.course?.id;
    const existing = courseId ? courseById.get(courseId) : null;
    const summary: ChildCourseSummary = {
      key: courseId || enrollment.id,
      courseName: enrollment.course?.name || existing?.courseName || '课程待确认',
      className: enrollment.className || '班级待确认',
      campusName: enrollment.campus?.name || '空间待确认',
      teacherName: enrollment.teacher?.name || '机构人员待确认',
    };
    if (courseId) {
      courseById.set(courseId, summary);
    } else {
      courseById.set(enrollment.id, summary);
    }
  }

  return Array.from(courseById.values());
}

Page({
  data: {
    loading: true,
    needLogin: false,
    children: [] as ChildProfileItem[],
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
      const [children, lessonAccounts] = await Promise.all([
        fetchParentChildren(),
        fetchParentLessonAccounts(),
      ]);
      const lessonItems = lessonAccounts.map(toLessonAccountItem);
      const lessonItemsByStudentId = new Map<string, LessonAccountItem[]>();
      for (const item of lessonItems) {
        lessonItemsByStudentId.set(item.studentId, [
          ...(lessonItemsByStudentId.get(item.studentId) ?? []),
          item,
        ]);
      }
      this.setData({
        children: children.map((child) => ({
          ...child,
          meta: childMeta(child),
          statusLabel: childStatusLabel(child.status),
          courses: summarizeChildCourses(child, lessonItemsByStudentId.get(child.id) ?? []),
          emptyCourseText: '暂未开通常规课程',
        })),
        needLogin: false,
        loading: false,
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
