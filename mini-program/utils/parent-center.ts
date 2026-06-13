// Shared transforms and status labels for the parent-center surfaces (the "我的"
// hub and its detail sub-pages). Extracted so every sub-page renders identical
// labels and shapes without duplicating the mapping logic.
import {
  type ParentAttendance,
  type ParentCheckInSession,
  type ParentChild,
  type ParentHomeworkCheckIn,
  type ParentLessonAccount,
  type ParentNotification,
  type ParentOrder,
  type ParentSeatReservation,
} from '../services/api';
import { formatDateTime, money } from './format';

export type LessonAccountItem = ParentLessonAccount & {
  courseName: string;
  studentName: string;
  updatedAtLabel: string;
};

export type OrderItem = ParentOrder & {
  amountLabel: string;
  createdAtLabel: string;
  packageName: string;
  statusLabel: string;
  studentName: string;
  courseName: string;
};

export type AttendanceItem = ParentAttendance & {
  startsAtLabel: string;
  statusLabel: string;
  studentName: string;
};

export type CheckInItem = ParentCheckInSession & {
  checkInKey: string;
  startsAtLabel: string;
  courseName: string;
  classroomName: string;
  attendanceStatusLabel: string;
};

export type HomeworkItem = ParentHomeworkCheckIn & {
  createdAtLabel: string;
  studentName: string;
  courseName: string;
  reviewStatusLabel: string;
};

export type SeatReservationItem = ParentSeatReservation & {
  courseName: string;
  feeLabel: string;
  startsAtLabel: string;
  campusName: string;
  reservationStatusLabel: string;
  paymentStatusLabel: string;
  checkInStatusLabel: string;
  rescheduleOptionLabels: string[];
  canSelfReschedule: boolean;
};

export type NotificationItem = ParentNotification & {
  createdAtLabel: string;
  statusLabel: string;
};

export type HomeworkTarget = {
  key: string;
  studentId: string;
  courseId?: string | null;
  label: string;
};

export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待支付',
    unpaid: '未支付',
    paid: '已支付',
    cancelled: '已取消',
    refunded: '已退款',
  };
  return labels[status] || status;
}

export function reservationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_payment: '待支付',
    reserved: '已保留',
    cancelled: '已取消',
    expired: '已过期',
  };
  return labels[status] || status;
}

export function checkInStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待到课',
    checked_in: '已签到',
    no_show: '未到课',
  };
  return labels[status] || status;
}

export function orderTitle(order: ParentOrder): string {
  if (order.orderType === 'seat_reservation') return '试听席位保留费';
  if (order.orderType === 'manual_package_grant') return order.package?.name || '线下课时包';
  return order.package?.name || `${order.lessonCount} 课时包`;
}

export function attendanceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    present: '到课',
    leave: '请假',
    absent: '缺勤',
    makeup: '补课',
    trial: '试听',
  };
  return labels[status] || status;
}

export function notificationStatusLabel(status: string): string {
  if (status === 'unread') return '未读';
  if (status === 'read') return '已读';
  return status;
}

export function homeworkReviewStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    submitted: '待批阅',
    reviewed: '已批阅',
    needs_revision: '需订正',
  };
  return labels[status] || status;
}

export function toLessonAccountItem(item: ParentLessonAccount): LessonAccountItem {
  return {
    ...item,
    courseName: item.course?.name || '未知课程',
    studentName: item.student?.name || '未知学员',
    updatedAtLabel: formatDateTime(item.updatedAt),
  };
}

export function toOrderItem(item: ParentOrder): OrderItem {
  return {
    ...item,
    amountLabel: money(item.amount),
    createdAtLabel: formatDateTime(item.createdAt),
    packageName: orderTitle(item),
    statusLabel: orderStatusLabel(item.status),
    studentName: item.student?.name || '未关联学员',
    courseName: item.course?.name || '未关联课程',
  };
}

export function toSeatReservationItem(item: ParentSeatReservation): SeatReservationItem {
  return {
    ...item,
    courseName: item.course?.name || '课程待确认',
    feeLabel: money(item.reservationFeeAmount),
    startsAtLabel: item.trialSession ? formatDateTime(item.trialSession.startsAt) : '时间待确认',
    campusName: item.campus?.name || '地点待确认',
    reservationStatusLabel: reservationStatusLabel(item.reservationStatus),
    paymentStatusLabel: orderStatusLabel(item.paymentStatus),
    checkInStatusLabel: checkInStatusLabel(item.checkInStatus),
    rescheduleOptionLabels: item.rescheduleOptions.map(
      (session) =>
        `${session.title} · ${formatDateTime(session.startsAt)} · ${session.bookedCount}/${session.capacity}`,
    ),
    canSelfReschedule: item.canReschedule && item.rescheduleOptions.length > 0,
  };
}

export function toAttendanceItem(item: ParentAttendance): AttendanceItem {
  return {
    ...item,
    startsAtLabel: formatDateTime(item.startsAt),
    statusLabel: attendanceStatusLabel(item.status),
    studentName: item.student?.name || '未知学员',
  };
}

export function toCheckInItem(item: ParentCheckInSession): CheckInItem {
  return {
    ...item,
    checkInKey: `${item.sessionId}:${item.student.id}`,
    startsAtLabel: formatDateTime(item.startsAt),
    courseName: item.course?.name || '课程',
    classroomName: item.classroom?.name || '教室待确认',
    attendanceStatusLabel: item.attendanceStatus
      ? attendanceStatusLabel(item.attendanceStatus)
      : '已签到',
  };
}

export function toHomeworkItem(item: ParentHomeworkCheckIn): HomeworkItem {
  return {
    ...item,
    createdAtLabel: formatDateTime(item.createdAt),
    studentName: item.student?.name || '未知学员',
    courseName: item.course?.name || item.title,
    reviewStatusLabel: homeworkReviewStatusLabel(item.reviewStatus),
  };
}

export function toNotificationItem(item: ParentNotification): NotificationItem {
  return {
    ...item,
    createdAtLabel: formatDateTime(item.createdAt),
    statusLabel: notificationStatusLabel(item.status),
  };
}

// Builds the student/course options for homework punch-ins: prefer the parent's
// lesson accounts (student + course), falling back to bare children when none.
export function buildHomeworkTargets(
  lessonItems: LessonAccountItem[],
  children: ParentChild[],
): HomeworkTarget[] {
  if (lessonItems.length) {
    return lessonItems.map((item) => ({
      key: item.id,
      studentId: item.studentId,
      courseId: item.courseId,
      label: `${item.studentName} · ${item.courseName}`,
    }));
  }
  return children.map((child) => ({
    key: `child:${child.id}`,
    studentId: child.id,
    courseId: null,
    label: child.name,
  }));
}
