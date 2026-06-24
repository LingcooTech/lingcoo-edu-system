import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileCheck2,
  LogOut,
  PenLine,
  Receipt,
  Search,
  Shield,
  Sparkles,
  UsersRound,
  Wallet,
} from 'lucide-react';

import {
  applyOrderRefund,
  createParentHomeworkCheckIn,
  fetchChildren,
  fetchParentAttendance,
  fetchParentCalendar,
  fetchParentCheckInSessions,
  fetchParentHomeworkCheckIns,
  fetchParentLessonAccounts,
  fetchParentLessonFeedbacks,
  fetchParentOrders,
  fetchParentSeatReservations,
  fetchTeacherDashboard,
  fetchTeacherCalendar,
  fetchTeacherHomeworkCheckIns,
  fetchTeacherLessonFeedbacks,
  fetchTeacherSessionAttendance,
  publicApi,
  recordTeacherAttendance,
  reviewTeacherHomeworkCheckIn,
  rescheduleParentSeatReservation,
  saveTeacherSessionFeedbacks,
  submitParentCheckIn,
  type AttendanceStatus,
  type AuthAccount,
  type ChildStudent,
  type ParentAttendanceRecord,
  type ParentCalendarEvent,
  type ParentCheckInSession,
  type ParentHomeworkCheckIn,
  type ParentLessonAccount,
  type ParentLessonFeedback,
  type ParentOrder,
  type ParentSeatReservation,
  type TeacherClass,
  type TeacherCalendarEvent,
  type TeacherClassSession,
  type TeacherHomeworkCheckIn,
  type TeacherLessonFeedback,
  type TeacherRosterStudent,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { Modal } from '@/components/Modal';
import { useSession } from '@/features/session';
import { useSeo } from '@/lib/seo';
import { formatDateTime, money } from '@/lib/utils';

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  unpaid: '未支付',
  paid: '已支付',
  refunded: '已退款',
  cancelled: '已取消',
};

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  pending_payment: '待支付',
  reserved: '已保留',
  cancelled: '已取消',
  expired: '已过期',
};

const CHECK_IN_STATUS_LABEL: Record<string, string> = {
  pending: '待到课',
  checked_in: '已签到',
  no_show: '未到课',
};

const SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: '已排课',
  completed: '已完成',
  cancelled: '已取消',
};

const ATTENDANCE_STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到课' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺勤' },
  { value: 'makeup', label: '补课' },
  { value: 'trial', label: '试听' },
];

const TEACHER_ROLL_CALL_STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到课' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '未到' },
];

const ATTENDANCE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ATTENDANCE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

const HOMEWORK_REVIEW_STATUS_LABEL: Record<string, string> = {
  submitted: '待批阅',
  reviewed: '已批阅',
  needs_revision: '需订正',
};

const REFUND_STATUS_LABEL: Record<string, string> = {
  pending: '退款审核中',
  approved: '退款已通过',
  rejected: '退款未通过',
  cancelled: '退款已取消',
};

const REFUND_REASON_OPTIONS = [
  { value: 'schedule_conflict', label: '时间冲突' },
  { value: 'course_not_fit', label: '课程不合适' },
  { value: 'duplicate_payment', label: '重复支付' },
  { value: 'service_issue', label: '服务问题' },
  { value: 'other', label: '其他原因' },
] as const;

function SectionHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="text-ink mb-3 flex items-center gap-2 text-sm font-semibold">
      {icon}
      {children}
    </div>
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function calendarRange(days = 30) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = addDays(from, days);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function dateKey(value: string) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 周${'日一二三四五六'[date.getDay()]}`;
}

function monthYearLabel(value: Date) {
  return `${value.getMonth() + 1}月/${value.getFullYear()}年`;
}

function sameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekDaysAround(value: Date) {
  const base = startOfDay(value);
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(base, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function isRollCallPending(event: {
  status: string;
  rosterCount?: number;
  attendanceCount?: number;
}) {
  return (
    event.status !== 'cancelled' &&
    event.status !== 'completed' &&
    (event.rosterCount ?? 0) > 0 &&
    (event.attendanceCount ?? 0) < (event.rosterCount ?? 0)
  );
}

function timeRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(
    end.getMinutes(),
  )}`;
}

function groupEventsByDate<T extends { startsAt: string }>(events: T[]) {
  return Array.from(
    events
      .slice()
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .reduce((groups, event) => {
        const key = dateKey(event.startsAt);
        groups.set(key, [...(groups.get(key) ?? []), event]);
        return groups;
      }, new Map<string, T[]>())
      .entries(),
  );
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <div className="pwcard text-muted p-4 text-sm">{children}</div>;
}

function orderTitle(order: ParentOrder) {
  if (order.orderType === 'seat_reservation') return '试听席位保留费';
  if (order.orderType === 'manual_package_grant') return order.package?.name ?? '线下添加课时包';
  return order.package?.name ?? '课时包订单';
}

function orderMeta(order: ParentOrder) {
  const courseName = order.course?.name;
  if (order.orderType === 'seat_reservation') {
    return [order.orderNo, courseName, '不计入课时'].filter(Boolean).join(' · ');
  }
  return [order.orderNo, courseName, `${order.lessonCount} 课时`].filter(Boolean).join(' · ');
}

function checkInKey(item: ParentCheckInSession) {
  return `${item.sessionId}:${item.student.id}`;
}

function parseImageUrls(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AccountPage() {
  const navigate = useNavigate();
  const { account, loading, openAuth, logout } = useSession();

  useSeo({
    title: account?.role === 'teacher' ? '老师工作台' : '个人中心',
  });

  // Accounts provisioned with a default password must rotate it first.
  useEffect(() => {
    if (!loading && account?.mustChangePassword) {
      navigate('/change-password');
    }
  }, [loading, account, navigate]);

  if (loading) {
    return (
      <Layout>
        <main className="text-muted px-5 py-16 text-center text-sm">加载中...</main>
      </Layout>
    );
  }

  if (!account) {
    return (
      <Layout>
        <main className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="text-ink text-xl font-bold">请先登录</h1>
          <p className="text-muted mt-2 text-sm">登录后可查看课程、课时包、签到与排课。</p>
          <button
            type="button"
            className="pwbtn pwbtn-primary mt-6"
            onClick={() => openAuth('login')}
          >
            登录 / 注册
          </button>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-ink text-2xl font-bold">{account.displayName}，欢迎您回来</h1>
            <p className="text-muted mt-1 text-sm">
              {account.role === 'teacher'
                ? '老师工作台'
                : account.role === 'admin'
                  ? '管理员'
                  : '家长中心'}
              {' · '}
              {account.email ?? account.phone}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/'))}
            className="border-line text-ink-soft hover:bg-paper inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm"
          >
            <LogOut className="h-4 w-4" />
            退出
          </button>
        </div>

        {account.role === 'admin' ? (
          <AdminView />
        ) : account.role === 'teacher' ? (
          <TeacherView />
        ) : (
          <ParentView account={account} />
        )}
      </main>
    </Layout>
  );
}

function AdminView() {
  return (
    <a
      href="/admin"
      className="border-line bg-brand-soft text-brand mt-6 flex items-center gap-2 rounded-2xl border p-4 text-sm font-semibold"
    >
      <Shield className="h-4 w-4" />
      进入管理后台
    </a>
  );
}

// --- Parent: children / lesson balances / orders / attendance ---

function ParentView({ account }: { account: AuthAccount }) {
  const [children, setChildren] = useState<ChildStudent[]>([]);
  const [accounts, setAccounts] = useState<ParentLessonAccount[]>([]);
  const [orders, setOrders] = useState<ParentOrder[]>([]);
  const [seatReservations, setSeatReservations] = useState<ParentSeatReservation[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<ParentCalendarEvent[]>([]);
  const [checkInSessions, setCheckInSessions] = useState<ParentCheckInSession[]>([]);
  const [attendance, setAttendance] = useState<ParentAttendanceRecord[]>([]);
  const [homeworkCheckIns, setHomeworkCheckIns] = useState<ParentHomeworkCheckIn[]>([]);
  const [lessonFeedbacks, setLessonFeedbacks] = useState<ParentLessonFeedback[]>([]);
  const [rescheduleTarget, setRescheduleTarget] = useState<ParentSeatReservation | null>(null);
  const [rescheduleSessionId, setRescheduleSessionId] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [checkingInKey, setCheckingInKey] = useState('');
  const [checkInMessage, setCheckInMessage] = useState('');
  const [homeworkTargetId, setHomeworkTargetId] = useState('');
  const [homeworkContent, setHomeworkContent] = useState('');
  const [homeworkImageUrls, setHomeworkImageUrls] = useState('');
  const [homeworkSubmitting, setHomeworkSubmitting] = useState(false);
  const [homeworkMessage, setHomeworkMessage] = useState('');
  const [refundTarget, setRefundTarget] = useState<ParentOrder | null>(null);
  const [refundReason, setRefundReason] =
    useState<(typeof REFUND_REASON_OPTIONS)[number]['value']>('schedule_conflict');
  const [refundNote, setRefundNote] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundMessage, setRefundMessage] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [emailVerified, setEmailVerified] = useState(account.emailVerified);

  const reloadSeatReservations = useCallback(() => {
    fetchParentSeatReservations()
      .then(setSeatReservations)
      .catch(() => undefined);
  }, []);

  const reloadCheckInSessions = useCallback(() => {
    fetchParentCheckInSessions()
      .then(setCheckInSessions)
      .catch(() => undefined);
  }, []);

  const reloadCalendar = useCallback(() => {
    fetchParentCalendar(calendarRange(30))
      .then(setCalendarEvents)
      .catch(() => undefined);
  }, []);

  const reloadHomeworkCheckIns = useCallback(() => {
    fetchParentHomeworkCheckIns()
      .then(setHomeworkCheckIns)
      .catch(() => undefined);
  }, []);

  const reloadLessonFeedbacks = useCallback(() => {
    fetchParentLessonFeedbacks()
      .then(setLessonFeedbacks)
      .catch(() => undefined);
  }, []);

  const reloadOrders = useCallback(() => {
    fetchParentOrders()
      .then(setOrders)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchChildren()
      .then(setChildren)
      .catch(() => undefined);
    fetchParentLessonAccounts()
      .then(setAccounts)
      .catch(() => undefined);
    reloadOrders();
    reloadSeatReservations();
    reloadCalendar();
    reloadCheckInSessions();
    fetchParentAttendance()
      .then(setAttendance)
      .catch(() => undefined);
    reloadHomeworkCheckIns();
    reloadLessonFeedbacks();
  }, [
    reloadCalendar,
    reloadCheckInSessions,
    reloadHomeworkCheckIns,
    reloadLessonFeedbacks,
    reloadOrders,
    reloadSeatReservations,
  ]);

  useEffect(() => {
    const accountTargetExists = accounts.some((item) => item.id === homeworkTargetId);
    const childTargetExists = children.some((child) => `child:${child.id}` === homeworkTargetId);
    if (homeworkTargetId && (accountTargetExists || childTargetExists)) {
      return;
    }
    const firstAccountTarget = accounts.find((item) => item.student?.id);
    setHomeworkTargetId(firstAccountTarget?.id ?? (children[0] ? `child:${children[0].id}` : ''));
  }, [accounts, children, homeworkTargetId]);

  async function verifyEmail() {
    setVerifyMessage('');
    try {
      await publicApi('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      setEmailVerified(true);
      setVerifyMessage('邮箱验证成功');
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : '验证失败');
    }
  }

  function openReschedule(reservation: ParentSeatReservation) {
    setRescheduleTarget(reservation);
    setRescheduleSessionId(reservation.rescheduleOptions[0]?.id ?? '');
    setRescheduleError('');
  }

  async function submitReschedule() {
    if (!rescheduleTarget || !rescheduleSessionId) {
      setRescheduleError('请选择目标场次');
      return;
    }
    setRescheduling(true);
    setRescheduleError('');
    try {
      await rescheduleParentSeatReservation(rescheduleTarget.id, rescheduleSessionId);
      setRescheduleTarget(null);
      setRescheduleSessionId('');
      reloadSeatReservations();
    } catch (err) {
      setRescheduleError(err instanceof Error ? err.message : '改期失败');
    } finally {
      setRescheduling(false);
    }
  }

  async function submitCheckIn(item: ParentCheckInSession) {
    const key = checkInKey(item);
    setCheckingInKey(key);
    setCheckInMessage('');
    try {
      const result = await submitParentCheckIn(item.sessionId, item.student.id);
      setCheckInMessage(result.message);
      await Promise.all([
        fetchParentLessonAccounts().then(setAccounts),
        fetchParentAttendance().then(setAttendance),
        fetchParentCheckInSessions().then(setCheckInSessions),
        fetchParentCalendar(calendarRange(30)).then(setCalendarEvents),
      ]);
    } catch (err) {
      setCheckInMessage(err instanceof Error ? err.message : '签到失败');
    } finally {
      setCheckingInKey('');
    }
  }

  function resolveHomeworkTarget() {
    const accountTarget = accounts.find((item) => item.id === homeworkTargetId && item.student?.id);
    if (accountTarget?.student?.id) {
      return {
        studentId: accountTarget.student.id,
        courseId: accountTarget.course?.id ?? null,
      };
    }
    const child = children.find((item) => `child:${item.id}` === homeworkTargetId);
    return child ? { studentId: child.id, courseId: null } : null;
  }

  async function submitHomework(event: FormEvent) {
    event.preventDefault();
    const target = resolveHomeworkTarget();
    const content = homeworkContent.trim();
    const imageUrls = parseImageUrls(homeworkImageUrls);
    if (!target) {
      setHomeworkMessage('请选择学员');
      return;
    }
    if (!content && imageUrls.length === 0) {
      setHomeworkMessage('请填写作业打卡内容或图片链接');
      return;
    }

    setHomeworkSubmitting(true);
    setHomeworkMessage('');
    try {
      const result = await createParentHomeworkCheckIn({
        ...target,
        content,
        imageUrls,
      });
      setHomeworkMessage(result.message);
      setHomeworkContent('');
      setHomeworkImageUrls('');
      await reloadHomeworkCheckIns();
    } catch (err) {
      setHomeworkMessage(err instanceof Error ? err.message : '作业打卡提交失败');
    } finally {
      setHomeworkSubmitting(false);
    }
  }

  function openRefund(order: ParentOrder) {
    setRefundTarget(order);
    setRefundReason('schedule_conflict');
    setRefundNote('');
    setRefundMessage('');
  }

  async function submitRefund() {
    if (!refundTarget) return;
    setRefundSubmitting(true);
    setRefundMessage('');
    try {
      await applyOrderRefund(refundTarget.orderNo, {
        reason: refundReason,
        buyerNote: refundNote.trim() || undefined,
      });
      setRefundTarget(null);
      setRefundNote('');
      await reloadOrders();
    } catch (err) {
      setRefundMessage(err instanceof Error ? err.message : '退款申请提交失败');
    } finally {
      setRefundSubmitting(false);
    }
  }

  const homeworkAccountTargets = accounts.filter((item) => item.student?.id);
  const homeworkChildTargets = homeworkAccountTargets.length === 0 ? children : [];
  const calendarGroups = useMemo(() => groupEventsByDate(calendarEvents), [calendarEvents]);

  return (
    <>
      {account.email && !emailVerified && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-800">邮箱待验证</div>
          <p className="mt-1 text-xs text-amber-700">
            注册时已向 {account.email} 发送验证码（若未配置邮件服务，请联系机构获取）。
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className="border-line flex-1 rounded-xl border px-3 py-2 text-sm"
              placeholder="6 位验证码"
              value={verifyCode}
              onChange={(event) => setVerifyCode(event.target.value)}
            />
            <button
              onClick={verifyEmail}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
            >
              验证
            </button>
          </div>
          {verifyMessage && <div className="mt-2 text-xs text-amber-700">{verifyMessage}</div>}
        </div>
      )}

      <section className="mt-6">
        <SectionHeading icon={<BookOpen className="text-brand h-4 w-4" />}>我的孩子</SectionHeading>
        {children.length === 0 ? (
          <EmptyCard>暂未关联孩子。请联系机构，将您的账号与学员档案关联。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {children.map((child) => (
              <div key={child.id} className="pwcard p-4">
                <div className="text-ink text-sm font-semibold">{child.name}</div>
                <div className="text-muted mt-1 text-xs">
                  {child.grade}
                  {child.school ? ` · ${child.school}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<CalendarDays className="text-brand h-4 w-4" />}>
          课程表
        </SectionHeading>
        {calendarGroups.length === 0 ? (
          <EmptyCard>近 30 天暂无正式课程安排。</EmptyCard>
        ) : (
          <div className="grid gap-3">
            {calendarGroups.map(([day, events]) => (
              <div key={day} className="pwcard overflow-hidden">
                <div className="bg-paper text-ink flex items-center justify-between px-4 py-2 text-sm font-semibold">
                  <span>{dateLabel(events[0].startsAt)}</span>
                  <span className="text-muted text-xs">{events.length} 节</span>
                </div>
                <div className="divide-line divide-y">
                  {events.map((event) => (
                    <div key={event.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-ink text-sm font-semibold">
                            {event.course?.name ?? '课程'} · {event.title}
                          </div>
                          <div className="text-muted mt-1 text-xs">
                            {event.student.name} · {event.class.name}
                          </div>
                        </div>
                        <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                          {event.checkedIn
                            ? (ATTENDANCE_STATUS_LABEL[event.attendanceStatus ?? 'present'] ??
                              '已签到')
                            : (SESSION_STATUS_LABEL[event.status] ?? event.status)}
                        </span>
                      </div>
                      <div className="text-ink-soft mt-3 text-xs">
                        {timeRange(event.startsAt, event.endsAt)} ·{' '}
                        {event.classroom?.name ?? '教室待确认'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<CalendarClock className="text-brand h-4 w-4" />}>
          试听席位
        </SectionHeading>
        {seatReservations.length === 0 ? (
          <EmptyCard>暂无试听席位预约。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {seatReservations.map((reservation) => {
              const canOpenReschedule =
                reservation.canReschedule && reservation.rescheduleOptions.length > 0;
              return (
                <div key={reservation.id} className="pwcard p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-ink text-sm font-semibold">
                        {reservation.trialSession?.title ?? '试听预约'}
                      </div>
                      <div className="text-muted mt-1 text-xs">
                        {reservation.course?.name ?? '课程待确认'} · {reservation.studentName}
                      </div>
                    </div>
                    <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                      {RESERVATION_STATUS_LABEL[reservation.reservationStatus] ??
                        reservation.reservationStatus}
                    </span>
                  </div>
                  <div className="text-ink-soft mt-3 grid gap-1 text-xs">
                    <span>
                      {reservation.trialSession
                        ? formatDateTime(reservation.trialSession.startsAt)
                        : '时间待确认'}
                    </span>
                    <span>
                      {reservation.campus?.name ?? '地点待确认'} ·{' '}
                      {money(reservation.reservationFeeAmount)}
                    </span>
                    <span>
                      {ORDER_STATUS_LABEL[reservation.paymentStatus] ?? reservation.paymentStatus} ·{' '}
                      {CHECK_IN_STATUS_LABEL[reservation.checkInStatus] ??
                        reservation.checkInStatus}{' '}
                      · 改期 {reservation.rescheduleCount}/1
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {canOpenReschedule ? (
                      <button
                        type="button"
                        className="border-line text-ink hover:bg-paper inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                        onClick={() => openReschedule(reservation)}
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        改期
                      </button>
                    ) : reservation.canReschedule ? (
                      <span className="text-muted text-xs">暂无可改期场次</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<FileCheck2 className="text-brand h-4 w-4" />}>
          上课签到
        </SectionHeading>
        {checkInMessage && (
          <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            {checkInMessage}
          </div>
        )}
        {checkInSessions.length === 0 ? (
          <EmptyCard>暂无可签到课次。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {checkInSessions.map((item) => {
              const key = checkInKey(item);
              return (
                <div key={key} className="pwcard p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-ink text-sm font-semibold">
                        {item.course?.name ?? '课程'} · {item.topic}
                      </div>
                      <div className="text-muted mt-1 text-xs">
                        {item.student.name} · {item.class.name}
                      </div>
                    </div>
                    {item.checkedIn ? (
                      <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                        {ATTENDANCE_STATUS_LABEL[item.attendanceStatus ?? 'present'] ?? '已签到'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="pwbtn pwbtn-primary px-3 py-1.5 text-xs"
                        disabled={!item.canCheckIn || checkingInKey === key}
                        onClick={() => void submitCheckIn(item)}
                      >
                        {checkingInKey === key ? '签到中...' : '签到'}
                      </button>
                    )}
                  </div>
                  <div className="text-ink-soft mt-3 text-xs">
                    {formatDateTime(item.startsAt)} · {item.classroom?.name ?? '教室待确认'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<PenLine className="text-brand h-4 w-4" />}>作业打卡</SectionHeading>
        <form className="pwcard grid gap-3 p-4" onSubmit={submitHomework}>
          <label className="grid gap-1 text-sm">
            <span className="text-ink font-medium">学员 / 课程</span>
            <select
              className="border-line rounded-xl border bg-white px-3 py-2"
              value={homeworkTargetId}
              onChange={(event) => setHomeworkTargetId(event.target.value)}
              disabled={homeworkAccountTargets.length === 0 && homeworkChildTargets.length === 0}
            >
              {homeworkAccountTargets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.student?.name ?? '学员'} · {item.course?.name ?? '未关联课程'}
                </option>
              ))}
              {homeworkChildTargets.map((child) => (
                <option key={child.id} value={`child:${child.id}`}>
                  {child.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-ink font-medium">打卡内容</span>
            <textarea
              className="border-line min-h-24 rounded-xl border px-3 py-2"
              value={homeworkContent}
              onChange={(event) => setHomeworkContent(event.target.value)}
              placeholder="完成内容、练习情况或需要老师关注的问题"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-ink font-medium">图片链接</span>
            <textarea
              className="border-line min-h-20 rounded-xl border px-3 py-2"
              value={homeworkImageUrls}
              onChange={(event) => setHomeworkImageUrls(event.target.value)}
              placeholder="每行一个图片链接，可选"
            />
          </label>
          {homeworkMessage && (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              {homeworkMessage}
            </div>
          )}
          <button
            type="submit"
            className="pwbtn pwbtn-primary w-fit px-4"
            disabled={
              homeworkSubmitting ||
              (homeworkAccountTargets.length === 0 && homeworkChildTargets.length === 0)
            }
          >
            {homeworkSubmitting ? '提交中...' : '提交打卡'}
          </button>
        </form>
        {homeworkCheckIns.length === 0 ? (
          <EmptyCard>暂无作业打卡。</EmptyCard>
        ) : (
          <div className="mt-3 grid gap-2">
            {homeworkCheckIns.map((item) => (
              <div key={item.id} className="pwcard p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-ink text-sm font-semibold">
                      {item.student?.name ?? '学员'} · {item.course?.name ?? item.title}
                    </div>
                    <div className="text-muted mt-1 text-xs">{formatDateTime(item.createdAt)}</div>
                  </div>
                  <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                    {HOMEWORK_REVIEW_STATUS_LABEL[item.reviewStatus] ?? item.reviewStatus}
                  </span>
                </div>
                {item.content ? (
                  <p className="text-ink-soft mt-3 text-sm leading-6 whitespace-pre-wrap">
                    {item.content}
                  </p>
                ) : null}
                {item.imageUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {item.imageUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="作业打卡"
                        loading="lazy"
                        decoding="async"
                        className="aspect-square rounded-xl object-cover"
                      />
                    ))}
                  </div>
                ) : null}
                {item.teacherFeedback ? (
                  <div className="bg-paper text-ink-soft mt-3 rounded-xl p-3 text-sm leading-6">
                    {item.teacherFeedback}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<Sparkles className="text-brand h-4 w-4" />}>课后点评</SectionHeading>
        {lessonFeedbacks.length === 0 ? (
          <EmptyCard>暂无课后点评。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {lessonFeedbacks.map((item) => (
              <div key={item.id} className="pwcard p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-ink text-sm font-semibold">
                      {item.student?.name ?? '学员'} · {item.course?.name ?? '课程'}
                    </div>
                    <div className="text-muted mt-1 text-xs">
                      {item.session
                        ? formatDateTime(item.session.startsAt)
                        : formatDateTime(item.createdAt)}
                      {item.class?.name ? ` · ${item.class.name}` : ''}
                    </div>
                  </div>
                  {item.teacher?.name ? (
                    <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                      {item.teacher.name}
                    </span>
                  ) : null}
                </div>
                {item.content ? (
                  <p className="text-ink-soft mt-3 text-sm leading-6 whitespace-pre-wrap">
                    {item.content}
                  </p>
                ) : null}
                {item.imageUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {item.imageUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="课后点评"
                        loading="lazy"
                        decoding="async"
                        className="aspect-square rounded-xl object-cover"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<Wallet className="text-brand h-4 w-4" />}>
          课时包 / 余额
        </SectionHeading>
        {accounts.length === 0 ? (
          <EmptyCard>暂无课时账户。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {accounts.map((item) => (
              <div key={item.id} className="pwcard flex items-center justify-between p-4">
                <div className="text-ink text-sm font-semibold">{item.student?.name ?? '学员'}</div>
                <div className="text-brand text-sm font-semibold">剩余 {item.balance} 课时</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<CheckSquare className="text-brand h-4 w-4" />}>
          签到记录
        </SectionHeading>
        {attendance.length === 0 ? (
          <EmptyCard>暂无签到记录。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {attendance.map((record) => (
              <div key={record.id} className="pwcard p-4">
                <div className="flex items-center justify-between">
                  <div className="text-ink text-sm font-semibold">
                    {record.courseName} · {record.topic}
                  </div>
                  <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                    {ATTENDANCE_STATUS_LABEL[record.status] ?? record.status}
                  </span>
                </div>
                <div className="text-muted mt-1 text-xs">
                  {record.student?.name ?? '学员'} · {formatDateTime(record.startsAt)}
                  {record.lessonDelta !== 0 ? ` · 消课 ${Math.abs(record.lessonDelta)}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<Receipt className="text-brand h-4 w-4" />}>我的订单</SectionHeading>
        {orders.length === 0 ? (
          <EmptyCard>暂无订单。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {orders.map((order) => (
              <div key={order.id} className="pwcard p-4">
                <div className="flex items-center justify-between">
                  <div className="text-ink text-sm font-semibold">{orderTitle(order)}</div>
                  <div className="text-ink text-sm font-semibold">{money(order.amount)}</div>
                </div>
                <div className="text-muted mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>{orderMeta(order)}</span>
                  <span>{ORDER_STATUS_LABEL[order.status] ?? order.status}</span>
                </div>
                {order.refundRequests?.length ? (
                  <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {REFUND_STATUS_LABEL[order.refundRequests[0].status] ??
                      order.refundRequests[0].status}
                    {order.refundRequests[0].adminNote
                      ? `：${order.refundRequests[0].adminNote}`
                      : ''}
                  </div>
                ) : null}
                {order.status === 'paid' &&
                !order.refundRequests?.some((item) => item.status === 'pending') ? (
                  <button
                    type="button"
                    className="border-line text-ink hover:bg-paper mt-3 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                    onClick={() => openRefund(order)}
                  >
                    申请退款
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="改期试听席位"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="pwbtn pwbtn-outline px-4 py-2"
              onClick={() => setRescheduleTarget(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="pwbtn pwbtn-primary px-4 py-2"
              onClick={submitReschedule}
              disabled={rescheduling || !rescheduleSessionId}
            >
              {rescheduling ? '改期中...' : '确认改期'}
            </button>
          </div>
        }
      >
        {rescheduleTarget ? (
          <div className="space-y-3">
            <div>
              <div className="text-ink text-sm font-semibold">
                {rescheduleTarget.trialSession?.title ?? '试听预约'}
              </div>
              <div className="text-muted mt-1 text-xs">
                {rescheduleTarget.studentName} ·{' '}
                {rescheduleTarget.trialSession
                  ? formatDateTime(rescheduleTarget.trialSession.startsAt)
                  : '时间待确认'}
              </div>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-ink font-medium">目标场次</span>
              <select
                className="border-line rounded-xl border bg-white px-3 py-2"
                value={rescheduleSessionId}
                onChange={(event) => setRescheduleSessionId(event.target.value)}
              >
                <option value="">选择目标场次</option>
                {rescheduleTarget.rescheduleOptions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} · {formatDateTime(session.startsAt)} · {session.bookedCount}/
                    {session.capacity}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-muted text-xs">每笔试听席位保留费预约仅可改期一次。</p>
            {rescheduleError && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{rescheduleError}</div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(refundTarget)}
        onClose={() => setRefundTarget(null)}
        title="申请退款"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="pwbtn pwbtn-outline px-4 py-2"
              onClick={() => setRefundTarget(null)}
              disabled={refundSubmitting}
            >
              取消
            </button>
            <button
              type="button"
              className="pwbtn pwbtn-primary px-4 py-2"
              onClick={submitRefund}
              disabled={refundSubmitting}
            >
              {refundSubmitting ? '提交中...' : '提交申请'}
            </button>
          </div>
        }
      >
        {refundTarget ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {orderTitle(refundTarget)} · {money(refundTarget.paidAmount || refundTarget.amount)}
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-ink font-medium">退款原因</span>
              <select
                className="border-line rounded-xl border bg-white px-3 py-2"
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value as typeof refundReason)}
              >
                {REFUND_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-ink font-medium">补充说明</span>
              <textarea
                className="border-line min-h-24 rounded-xl border px-3 py-2"
                value={refundNote}
                onChange={(event) => setRefundNote(event.target.value)}
                placeholder="可填写希望机构了解的情况"
              />
            </label>
            <p className="text-muted text-xs">
              退款通过后，课时包订单会自动扣回未消耗课时；试听席位会释放名额。
            </p>
            {refundMessage && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{refundMessage}</div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

// --- Teacher: schedule (with 点名) + classes ---

function TeacherView() {
  const [calendarEvents, setCalendarEvents] = useState<TeacherCalendarEvent[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [homeworkCheckIns, setHomeworkCheckIns] = useState<TeacherHomeworkCheckIn[]>([]);
  const [lessonFeedbacks, setLessonFeedbacks] = useState<TeacherLessonFeedback[]>([]);
  const [rollCallSession, setRollCallSession] = useState<TeacherClassSession | null>(null);
  const [feedbackSession, setFeedbackSession] = useState<TeacherCalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [reviewTarget, setReviewTarget] = useState<TeacherHomeworkCheckIn | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'reviewed' | 'needs_revision'>('reviewed');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const reload = useCallback(() => {
    fetchTeacherDashboard()
      .then((dashboard) => {
        setClasses(dashboard.classes);
      })
      .catch(() => undefined);
    fetchTeacherCalendar(calendarRange(30))
      .then(setCalendarEvents)
      .catch(() => undefined);
    fetchTeacherHomeworkCheckIns()
      .then(setHomeworkCheckIns)
      .catch(() => undefined);
    fetchTeacherLessonFeedbacks()
      .then(setLessonFeedbacks)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function openReview(item: TeacherHomeworkCheckIn) {
    setReviewTarget(item);
    setReviewStatus(item.reviewStatus === 'needs_revision' ? 'needs_revision' : 'reviewed');
    setTeacherFeedback(item.teacherFeedback ?? '');
    setReviewError('');
  }

  async function submitReview() {
    if (!reviewTarget) {
      return;
    }
    setReviewSaving(true);
    setReviewError('');
    try {
      await reviewTeacherHomeworkCheckIn(reviewTarget.id, {
        reviewStatus,
        teacherFeedback: teacherFeedback.trim(),
      });
      setReviewTarget(null);
      setTeacherFeedback('');
      reload();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '批阅失败');
    } finally {
      setReviewSaving(false);
    }
  }

  const calendarGroups = useMemo(() => groupEventsByDate(calendarEvents), [calendarEvents]);
  const today = startOfDay(new Date());
  const selectedDateKey = dateKey(selectedDate.toISOString());
  const selectedEvents = useMemo(
    () =>
      calendarEvents
        .filter((event) => dateKey(event.startsAt) === selectedDateKey)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [calendarEvents, selectedDateKey],
  );
  const todayPendingEvents = useMemo(
    () =>
      calendarEvents
        .filter((event) => sameDate(new Date(event.startsAt), today) && isRollCallPending(event))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [calendarEvents, today],
  );
  const overduePendingCount = useMemo(
    () =>
      calendarEvents.filter(
        (event) => new Date(event.endsAt).getTime() < Date.now() && isRollCallPending(event),
      ).length,
    [calendarEvents],
  );
  const pendingHomeworkCount = homeworkCheckIns.filter(
    (item) => item.reviewStatus === 'submitted' || item.reviewStatus === 'needs_revision',
  ).length;
  const feedbackCountBySessionId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const feedback of lessonFeedbacks) {
      counts.set(feedback.classSessionId, (counts.get(feedback.classSessionId) ?? 0) + 1);
    }
    return counts;
  }, [lessonFeedbacks]);
  const feedbackEvents = useMemo(
    () =>
      calendarEvents
        .filter((event) => event.status !== 'cancelled')
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
        .slice(0, 10),
    [calendarEvents],
  );
  const weekDays = weekDaysAround(selectedDate);

  function openRollCall(event: TeacherCalendarEvent | TeacherClassSession) {
    setRollCallSession({
      id: event.id,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      topic: 'title' in event ? event.title : event.topic,
      status: event.status,
      class: event.class ? { name: event.class.name } : undefined,
      course: event.course ? { name: event.course.name } : undefined,
      classroom: event.classroom ? { name: event.classroom.name } : undefined,
      rosterCount: 'rosterCount' in event ? event.rosterCount : undefined,
      attendanceCount: 'attendanceCount' in event ? event.attendanceCount : undefined,
    });
  }

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <section className="mt-6 overflow-hidden rounded-3xl bg-[#ff9f1c] text-white shadow-sm">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="text-sm text-white/80">老师工作台</p>
            <h2 className="mt-1 text-xl font-bold">今日授课与点名</h2>
          </div>
          <button
            type="button"
            className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur"
            onClick={() => setSelectedDate(today)}
          >
            回到今天
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-5 py-5">
          <div>
            <div className="text-3xl font-semibold">{todayPendingEvents.length}</div>
            <div className="mt-1 text-xs text-white/80">今日待点名</div>
          </div>
          <div>
            <div className="text-3xl font-semibold">{overduePendingCount}</div>
            <div className="mt-1 text-xs text-white/80">超时未点</div>
          </div>
          <div>
            <div className="text-3xl font-semibold">{pendingHomeworkCount}</div>
            <div className="mt-1 text-xs text-white/80">待批阅</div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {[
          { label: '学员', icon: UsersRound, sectionId: 'teacher-classes' },
          { label: '班级', icon: UsersRound, sectionId: 'teacher-classes' },
          { label: '课表', icon: CalendarDays, sectionId: 'teacher-calendar' },
          { label: '点名', icon: ClipboardList, sectionId: 'teacher-roll-call' },
          { label: '上课记录', icon: CheckSquare, sectionId: 'teacher-calendar' },
          { label: '学习计划', icon: BookOpen, sectionId: 'teacher-classes' },
          { label: '课后点评', icon: PenLine, sectionId: 'teacher-feedbacks' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className="pwcard hover:bg-paper flex min-h-20 flex-col items-center justify-center gap-2 p-2 text-center text-xs font-medium transition-colors"
              onClick={() => scrollToSection(item.sectionId)}
            >
              <Icon className="text-brand h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </section>

      <section id="teacher-roll-call" className="mt-6 scroll-mt-4">
        <SectionHeading icon={<ClipboardList className="text-brand h-4 w-4" />}>
          今日待点名
        </SectionHeading>
        {todayPendingEvents.length === 0 ? (
          <EmptyCard>今天没有待点名课次。</EmptyCard>
        ) : (
          <div className="grid gap-3">
            {todayPendingEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className="pwcard hover:border-brand/40 w-full p-4 text-left transition-colors"
                onClick={() => openRollCall(event)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-ink text-lg font-semibold">
                      {timeRange(event.startsAt, event.endsAt)}
                    </div>
                    <div className="text-muted mt-1 text-xs">
                      {event.class?.name ?? '班级'} · {event.classroom?.name ?? '未设置教室'}
                    </div>
                  </div>
                  <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-xs font-semibold">
                    未点名
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section id="teacher-calendar" className="mt-6 scroll-mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeading icon={<CalendarDays className="text-brand h-4 w-4" />}>
            点名课表
          </SectionHeading>
          <span className="text-muted text-xs">{monthYearLabel(selectedDate)}</span>
        </div>
        <div className="pwcard overflow-hidden">
          <div className="border-line grid grid-cols-7 border-b">
            {weekDays.map((day) => {
              const hasSession = calendarEvents.some((event) =>
                sameDate(new Date(event.startsAt), day),
              );
              const selected = sameDate(day, selectedDate);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={`flex min-h-20 flex-col items-center justify-center gap-1 text-sm transition-colors ${
                    selected ? 'bg-brand-soft text-brand' : 'hover:bg-paper text-ink'
                  }`}
                  onClick={() => setSelectedDate(day)}
                >
                  <span className="text-muted text-xs">周{'日一二三四五六'[day.getDay()]}</span>
                  <span className="text-lg font-semibold">{day.getDate()}</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${hasSession ? 'bg-brand' : 'bg-transparent'}`}
                  />
                </button>
              );
            })}
          </div>
          <div className="divide-line divide-y">
            {selectedEvents.length === 0 ? (
              <div className="text-muted p-4 text-sm">当天暂无排课。</div>
            ) : (
              selectedEvents.map((event) => (
                <div key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-ink text-xl font-semibold">
                        {timeRange(event.startsAt, event.endsAt)}
                      </div>
                      <div className="text-ink mt-1 text-sm font-medium">
                        {event.class?.name ?? '班级'}
                      </div>
                      <div className="text-muted mt-1 text-xs">
                        {event.classroom?.name ?? '未设置教室'} · {event.title || '未设置上课内容'}
                      </div>
                    </div>
                    <span className="text-ink-soft text-sm">
                      {isRollCallPending(event)
                        ? '未点名'
                        : (SESSION_STATUS_LABEL[event.status] ?? event.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-muted text-xs">
                      已点 {event.attendanceCount}/{event.rosterCount}
                    </span>
                    {event.status !== 'cancelled' ? (
                      <button
                        type="button"
                        className="pwbtn pwbtn-outline px-4 py-2 text-xs"
                        onClick={() => openRollCall(event)}
                      >
                        点名
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section id="teacher-classes" className="mt-6 scroll-mt-4">
        <SectionHeading icon={<UsersRound className="text-brand h-4 w-4" />}>
          我的班级
        </SectionHeading>
        {classes.length === 0 ? (
          <EmptyCard>暂无班级。</EmptyCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes.map((item) => (
              <div key={item.id} className="pwcard p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-ink text-sm font-semibold">{item.name}</div>
                    <div className="text-muted mt-1 text-xs">
                      {item.course?.name ?? '课程'} · {item.classroom?.name ?? '教室'} ·{' '}
                      {item.students.length}/{item.capacity}
                    </div>
                  </div>
                  <span className="bg-paper text-ink-soft rounded-full px-2.5 py-1 text-xs">
                    {item.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.students.slice(0, 8).map((student) => (
                    <span
                      key={student.id}
                      className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs"
                    >
                      {student.name} · {student.grade}
                    </span>
                  ))}
                  {item.students.length > 8 ? (
                    <span className="text-muted text-xs">+{item.students.length - 8}</span>
                  ) : null}
                  {item.students.length === 0 && (
                    <span className="text-muted text-xs">暂无学员</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="teacher-feedbacks" className="mt-6 scroll-mt-4">
        <SectionHeading icon={<Sparkles className="text-brand h-4 w-4" />}>课后点评</SectionHeading>
        {feedbackEvents.length === 0 ? (
          <EmptyCard>暂无可点评课次。</EmptyCard>
        ) : (
          <div className="grid gap-3">
            {feedbackEvents.map((event) => {
              const feedbackCount = feedbackCountBySessionId.get(event.id) ?? 0;
              return (
                <div key={event.id} className="pwcard p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-ink text-sm font-semibold">
                        {event.class?.name ?? '班级'} · {event.title || '上课内容'}
                      </div>
                      <div className="text-muted mt-1 text-xs">
                        {formatDateTime(event.startsAt)} · {event.course?.name ?? '课程'}
                      </div>
                    </div>
                    <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                      已评 {feedbackCount}/{event.rosterCount}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-muted text-xs">
                      {event.classroom?.name ?? '未设置教室'}
                    </span>
                    <button
                      type="button"
                      className="pwbtn pwbtn-outline px-4 py-2 text-xs"
                      onClick={() => setFeedbackSession(event)}
                    >
                      写点评
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<PenLine className="text-brand h-4 w-4" />}>作业打卡</SectionHeading>
        {homeworkCheckIns.length === 0 ? (
          <EmptyCard>暂无作业打卡。</EmptyCard>
        ) : (
          <div className="grid gap-3">
            {homeworkCheckIns.map((item) => (
              <div key={item.id} className="pwcard p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-ink text-sm font-semibold">
                      {item.student?.name ?? '学员'} · {item.course?.name ?? item.title}
                    </div>
                    <div className="text-muted mt-1 text-xs">
                      {item.class?.name ?? '班级'} · {formatDateTime(item.createdAt)}
                    </div>
                  </div>
                  <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                    {HOMEWORK_REVIEW_STATUS_LABEL[item.reviewStatus] ?? item.reviewStatus}
                  </span>
                </div>
                {item.content ? (
                  <p className="text-ink-soft mt-3 text-sm leading-6 whitespace-pre-wrap">
                    {item.content}
                  </p>
                ) : null}
                {item.imageUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {item.imageUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="作业打卡"
                        loading="lazy"
                        decoding="async"
                        className="aspect-square rounded-xl object-cover"
                      />
                    ))}
                  </div>
                ) : null}
                {item.teacherFeedback ? (
                  <div className="bg-paper text-ink-soft mt-3 rounded-xl p-3 text-sm leading-6">
                    {item.teacherFeedback}
                  </div>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="border-line text-ink hover:bg-paper inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                    onClick={() => openReview(item)}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    批阅
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {rollCallSession ? (
        <RollCallModal
          session={rollCallSession}
          onClose={() => setRollCallSession(null)}
          onSaved={() => {
            setRollCallSession(null);
            reload();
          }}
        />
      ) : null}

      {feedbackSession ? (
        <LessonFeedbackModal
          session={feedbackSession}
          feedbacks={lessonFeedbacks.filter((item) => item.classSessionId === feedbackSession.id)}
          onClose={() => setFeedbackSession(null)}
          onSaved={() => {
            setFeedbackSession(null);
            reload();
          }}
        />
      ) : null}

      <Modal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title="批阅作业打卡"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="pwbtn pwbtn-outline px-4 py-2"
              onClick={() => setReviewTarget(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="pwbtn pwbtn-primary px-4 py-2"
              onClick={submitReview}
              disabled={reviewSaving}
            >
              {reviewSaving ? '保存中...' : '保存批阅'}
            </button>
          </div>
        }
      >
        {reviewTarget ? (
          <div className="space-y-3">
            <div>
              <div className="text-ink text-sm font-semibold">
                {reviewTarget.student?.name ?? '学员'} · {reviewTarget.course?.name ?? '作业打卡'}
              </div>
              <div className="text-muted mt-1 text-xs">
                {formatDateTime(reviewTarget.createdAt)}
              </div>
            </div>
            {reviewTarget.content ? (
              <p className="bg-paper text-ink-soft rounded-xl p-3 text-sm leading-6 whitespace-pre-wrap">
                {reviewTarget.content}
              </p>
            ) : null}
            <label className="grid gap-1 text-sm">
              <span className="text-ink font-medium">批阅结果</span>
              <select
                className="border-line rounded-xl border bg-white px-3 py-2"
                value={reviewStatus}
                onChange={(event) =>
                  setReviewStatus(event.target.value as 'reviewed' | 'needs_revision')
                }
              >
                <option value="reviewed">已批阅</option>
                <option value="needs_revision">需订正</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-ink font-medium">老师反馈</span>
              <textarea
                className="border-line min-h-28 rounded-xl border px-3 py-2"
                value={teacherFeedback}
                onChange={(event) => setTeacherFeedback(event.target.value)}
                placeholder="填写练习建议或订正要求"
              />
            </label>
            {reviewError && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{reviewError}</div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function LessonFeedbackModal({
  session,
  feedbacks,
  onClose,
  onSaved,
}: {
  session: TeacherCalendarEvent;
  feedbacks: TeacherLessonFeedback[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roster, setRoster] = useState<TeacherRosterStudent[]>([]);
  const [draft, setDraft] = useState<Record<string, { content: string; imageUrls: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchTeacherSessionAttendance(session.id)
      .then((data) => {
        if (!active) {
          return;
        }
        const feedbackByStudentId = new Map(feedbacks.map((item) => [item.studentId, item]));
        const nextDraft: Record<string, { content: string; imageUrls: string }> = {};
        for (const student of data.roster) {
          const item = feedbackByStudentId.get(student.id);
          nextDraft[student.id] = {
            content: item?.content ?? '',
            imageUrls: item?.imageUrls.join('\n') ?? '',
          };
        }
        setRoster(data.roster);
        setDraft(nextDraft);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [session.id, feedbacks]);

  function updateDraft(studentId: string, field: 'content' | 'imageUrls', value: string) {
    setDraft((current) => ({
      ...current,
      [studentId]: {
        content: current[studentId]?.content ?? '',
        imageUrls: current[studentId]?.imageUrls ?? '',
        [field]: value,
      },
    }));
  }

  async function submit() {
    const items = roster
      .map((student) => {
        const item = draft[student.id] ?? { content: '', imageUrls: '' };
        return {
          studentId: student.id,
          content: item.content.trim(),
          imageUrls: parseImageUrls(item.imageUrls),
        };
      })
      .filter((item) => item.content || item.imageUrls.length > 0);

    if (items.length === 0) {
      setError('请至少填写一位学员的点评内容或图片');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveTeacherSessionFeedbacks(session.id, items);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="课后点评"
      panelClassName="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="pwbtn pwbtn-outline px-4 py-2" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="pwbtn pwbtn-primary px-4 py-2"
            onClick={submit}
            disabled={saving || loading}
          >
            {saving ? '保存中...' : '保存点评'}
          </button>
        </div>
      }
    >
      <div className="bg-brand-soft rounded-2xl p-4">
        <div className="text-ink text-sm font-semibold">
          {session.class?.name ?? '班级'} · {session.title || '上课内容'}
        </div>
        <div className="text-muted mt-1 text-xs">
          {formatDateTime(session.startsAt)} · {session.course?.name ?? '课程'}
        </div>
      </div>

      {loading ? (
        <div className="text-muted mt-4 text-sm">正在加载花名册...</div>
      ) : roster.length === 0 ? (
        <EmptyCard>本课次暂无正式学员。</EmptyCard>
      ) : (
        <div className="mt-4 grid gap-3">
          {roster.map((student) => (
            <div key={student.id} className="border-line rounded-2xl border p-3">
              <div className="text-ink text-sm font-semibold">
                {student.name} · {student.grade}
              </div>
              <label className="mt-3 grid gap-1 text-sm">
                <span className="text-ink font-medium">点评内容</span>
                <textarea
                  className="border-line min-h-24 rounded-xl border px-3 py-2"
                  value={draft[student.id]?.content ?? ''}
                  onChange={(event) => updateDraft(student.id, 'content', event.target.value)}
                  placeholder="课堂表现、掌握情况、课后建议"
                />
              </label>
              <label className="mt-3 grid gap-1 text-sm">
                <span className="text-ink font-medium">图片链接</span>
                <textarea
                  className="border-line min-h-16 rounded-xl border px-3 py-2"
                  value={draft[student.id]?.imageUrls ?? ''}
                  onChange={(event) => updateDraft(student.id, 'imageUrls', event.target.value)}
                  placeholder="每行一个图片链接，可选"
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
    </Modal>
  );
}

// Teacher roll-call (点名): loads the roster + any existing attendance, lets the
// teacher set a status per not-yet-recorded student, and submits. Recording is
// idempotent on the server — already-recorded students are never re-deducted.
function RollCallModal({
  session,
  onClose,
  onSaved,
}: {
  session: TeacherClassSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roster, setRoster] = useState<Array<{ id: string; name: string; grade: string }>>([]);
  const [recordedStatus, setRecordedStatus] = useState<Record<string, AttendanceStatus>>({});
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchTeacherSessionAttendance(session.id)
      .then((data) => {
        if (!active) {
          return;
        }
        setRoster(data.roster);
        const recorded: Record<string, AttendanceStatus> = {};
        for (const record of data.attendanceRecords) {
          recorded[record.studentId] = record.status;
        }
        setRecordedStatus(recorded);
        const initialDraft: Record<string, AttendanceStatus> = {};
        for (const student of data.roster) {
          if (!recorded[student.id]) {
            initialDraft[student.id] = 'present';
          }
        }
        setDraft(initialDraft);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [session.id]);

  const pending = roster.filter((student) => !recordedStatus[student.id]);
  const visibleRoster = roster.filter((student) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return `${student.name} ${student.grade}`.toLowerCase().includes(normalized);
  });
  const summary = roster.reduce(
    (acc, student) => {
      const status = recordedStatus[student.id] ?? draft[student.id] ?? 'present';
      if (status === 'present') acc.present += 1;
      if (status === 'late') acc.late += 1;
      if (status === 'leave') acc.leave += 1;
      if (status === 'absent') acc.absent += 1;
      return acc;
    },
    { present: 0, late: 0, leave: 0, absent: 0 },
  );

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const records = pending.map((student) => ({
        studentId: student.id,
        status: draft[student.id] ?? 'present',
      }));
      if (records.length > 0) {
        await recordTeacherAttendance(session.id, records);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="点名"
      panelClassName="max-w-3xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-ink text-sm">
            到课<span className="text-brand font-semibold">{summary.present}</span> 迟到
            <span className="text-brand font-semibold">{summary.late}</span> 请假
            <span className="text-brand font-semibold">{summary.leave}</span> 未到
            <span className="text-brand font-semibold">{summary.absent}</span>
          </div>
          <button
            type="button"
            className="pwbtn pwbtn-primary w-full px-5 py-3 sm:w-auto"
            onClick={submit}
            disabled={saving || loading || pending.length === 0}
          >
            {saving ? '保存中...' : pending.length === 0 ? '已完成点名' : '完成点名'}
          </button>
        </div>
      }
    >
      <div className="bg-brand-soft text-brand rounded-2xl p-4 text-center">
        <div className="text-sm">{dateLabel(session.startsAt)}</div>
        <div className="text-ink mt-2 text-3xl font-semibold">
          {timeRange(session.startsAt, session.endsAt)}
        </div>
        <div className="text-ink-soft mt-2 text-sm">{session.class?.name ?? '班级'}</div>
        <div className="text-muted mt-1 text-xs">
          {session.course?.name ?? '课程'} / {session.classroom?.name ?? '未设置教室'}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-ink text-sm font-semibold">本次授课课时</div>
          <div className="text-muted mt-1 text-xs">当前版本固定扣 1 课时</div>
        </div>
        <div className="border-line flex h-9 overflow-hidden rounded-xl border text-sm">
          <button type="button" className="text-muted w-10" disabled>
            -
          </button>
          <div className="border-line flex w-10 items-center justify-center border-x">1</div>
          <button type="button" className="text-muted w-10" disabled>
            +
          </button>
        </div>
      </div>

      <div className="text-muted mt-4 grid grid-cols-[1fr_repeat(4,56px)] items-center gap-2 text-center text-sm">
        <div className="text-left">学员姓名</div>
        {TEACHER_ROLL_CALL_STATUS_OPTIONS.map((option) => (
          <div key={option.value}>{option.label}</div>
        ))}
      </div>
      <label className="relative mt-3 block">
        <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          className="pwinput pl-10"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索学员姓名快速定位"
        />
      </label>
      {loading ? (
        <div className="text-muted py-6 text-center text-sm">加载中...</div>
      ) : roster.length === 0 ? (
        <div className="text-muted py-6 text-center text-sm">本班暂无学员。</div>
      ) : (
        <div className="mt-3 grid max-h-[50vh] overflow-y-auto">
          {visibleRoster.map((student) => {
            const recorded = recordedStatus[student.id];
            const currentStatus = recorded ?? draft[student.id] ?? 'present';
            return (
              <div
                key={student.id}
                className="border-line grid grid-cols-[1fr_repeat(4,56px)] items-center gap-2 border-b py-4 text-center"
              >
                <div className="min-w-0 text-left">
                  <div className="text-ink text-sm font-medium">{student.name}</div>
                  <div className="text-muted mt-1 text-xs">{student.grade} · 本次扣 1 课时</div>
                </div>
                {TEACHER_ROLL_CALL_STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`mx-auto h-8 w-8 rounded-full border transition-colors ${
                      currentStatus === option.value
                        ? 'border-brand bg-brand shadow-sm'
                        : 'border-line bg-surface'
                    } ${recorded ? 'opacity-70' : ''}`}
                    aria-label={`${student.name}${option.label}`}
                    disabled={Boolean(recorded)}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        [student.id]: option.value,
                      }))
                    }
                  />
                ))}
              </div>
            );
          })}
          {visibleRoster.length === 0 ? (
            <div className="text-muted py-6 text-center text-sm">没有匹配的学员。</div>
          ) : null}
        </div>
      )}
      {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
    </Modal>
  );
}
