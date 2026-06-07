import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  LogOut,
  Receipt,
  Shield,
  UsersRound,
  Wallet,
} from 'lucide-react';

import {
  fetchChildren,
  fetchParentAttendance,
  fetchParentLessonAccounts,
  fetchParentOrders,
  fetchParentSeatReservations,
  fetchTeacherDashboard,
  fetchTeacherSessionAttendance,
  publicApi,
  recordTeacherAttendance,
  rescheduleParentSeatReservation,
  type AttendanceStatus,
  type AuthAccount,
  type ChildStudent,
  type ParentAttendanceRecord,
  type ParentLessonAccount,
  type ParentOrder,
  type ParentSeatReservation,
  type TeacherClass,
  type TeacherClassSession,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { Modal } from '@/components/Modal';
import { useSession } from '@/features/session';
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
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺勤' },
  { value: 'makeup', label: '补课' },
  { value: 'trial', label: '试听' },
];

const ATTENDANCE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ATTENDANCE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

function SectionHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="text-ink mb-3 flex items-center gap-2 text-sm font-semibold">
      {icon}
      {children}
    </div>
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

export function AccountPage() {
  const navigate = useNavigate();
  const { account, loading, openAuth, logout } = useSession();

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
  const [attendance, setAttendance] = useState<ParentAttendanceRecord[]>([]);
  const [rescheduleTarget, setRescheduleTarget] = useState<ParentSeatReservation | null>(null);
  const [rescheduleSessionId, setRescheduleSessionId] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [emailVerified, setEmailVerified] = useState(account.emailVerified);

  const reloadSeatReservations = useCallback(() => {
    fetchParentSeatReservations()
      .then(setSeatReservations)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchChildren()
      .then(setChildren)
      .catch(() => undefined);
    fetchParentLessonAccounts()
      .then(setAccounts)
      .catch(() => undefined);
    fetchParentOrders()
      .then(setOrders)
      .catch(() => undefined);
    reloadSeatReservations();
    fetchParentAttendance()
      .then(setAttendance)
      .catch(() => undefined);
  }, [reloadSeatReservations]);

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
    </>
  );
}

// --- Teacher: schedule (with 点名) + classes ---

function TeacherView() {
  const [sessions, setSessions] = useState<TeacherClassSession[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [rollCallSession, setRollCallSession] = useState<TeacherClassSession | null>(null);

  const reload = useCallback(() => {
    fetchTeacherDashboard()
      .then((dashboard) => {
        setSessions(dashboard.sessions);
        setClasses(dashboard.classes);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <section className="mt-6">
        <SectionHeading icon={<CalendarDays className="text-brand h-4 w-4" />}>
          我的课表
        </SectionHeading>
        {sessions.length === 0 ? (
          <EmptyCard>暂无排课。</EmptyCard>
        ) : (
          <div className="grid gap-2">
            {sessions.map((session) => (
              <div key={session.id} className="pwcard p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-ink text-sm font-semibold">
                      {session.class?.name ?? '班级'} · {session.topic}
                    </div>
                    <div className="text-muted mt-1 text-xs">
                      {session.course?.name ?? '课程'} · {session.classroom?.name ?? '教室'}
                    </div>
                  </div>
                  <span className="bg-paper text-ink-soft rounded-full px-2.5 py-1 text-xs">
                    {SESSION_STATUS_LABEL[session.status] ?? session.status}
                  </span>
                </div>
                <div className="text-ink-soft mt-3 flex items-center justify-between text-sm">
                  <span>
                    {formatDateTime(session.startsAt)} - {formatDateTime(session.endsAt)}
                  </span>
                  {session.status !== 'cancelled' ? (
                    <button
                      type="button"
                      className="border-line text-ink hover:bg-paper inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                      onClick={() => setRollCallSession(session)}
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      点名
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading icon={<UsersRound className="text-brand h-4 w-4" />}>
          我的班级
        </SectionHeading>
        {classes.length === 0 ? (
          <EmptyCard>暂无班级。</EmptyCard>
        ) : (
          <div className="grid gap-3">
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
                  {item.students.map((student) => (
                    <span
                      key={student.id}
                      className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs"
                    >
                      {student.name} · {student.grade}
                    </span>
                  ))}
                  {item.students.length === 0 && (
                    <span className="text-muted text-xs">暂无学员</span>
                  )}
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
    </>
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
      title={`点名 · ${session.class?.name ?? '班级'}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="pwbtn pwbtn-outline px-4 py-2" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="pwbtn pwbtn-primary px-4 py-2"
            onClick={submit}
            disabled={saving || loading || pending.length === 0}
          >
            {saving ? '保存中...' : '提交点名'}
          </button>
        </div>
      }
    >
      <p className="text-muted mb-3 text-xs">
        {session.topic} · {formatDateTime(session.startsAt)}
      </p>
      {loading ? (
        <div className="text-muted py-6 text-center text-sm">加载中...</div>
      ) : roster.length === 0 ? (
        <div className="text-muted py-6 text-center text-sm">本班暂无学员。</div>
      ) : (
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
          {roster.map((student) => {
            const recorded = recordedStatus[student.id];
            return (
              <div
                key={student.id}
                className="border-line flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              >
                <div>
                  <div className="text-ink text-sm font-medium">{student.name}</div>
                  <div className="text-muted text-xs">{student.grade}</div>
                </div>
                {recorded ? (
                  <span className="bg-paper text-ink-soft rounded-full px-2.5 py-1 text-xs">
                    已记录 · {ATTENDANCE_STATUS_LABEL[recorded] ?? recorded}
                  </span>
                ) : (
                  <select
                    className="border-line rounded-lg border px-2 py-1.5 text-sm"
                    value={draft[student.id] ?? 'present'}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        [student.id]: event.target.value as AttendanceStatus,
                      }))
                    }
                  >
                    {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
    </Modal>
  );
}
