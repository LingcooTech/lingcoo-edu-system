import { useState } from 'react';
import {
  Ban,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Plus,
  QrCode,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';

import { api, apiDelete, apiPatch, apiPost } from '@/api/client';
import type {
  Campus,
  ClassGroup,
  Course,
  CourseContract,
  CoursePackage,
  Lead,
  SeatReservation,
  TrialSession,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime, money } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

const TRIALS = () => '/v1/trial-sessions';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '现金',
  bank_transfer: '银行转账',
  wechat_offline: '微信线下',
  alipay_offline: '支付宝线下',
  offline_other: '其他线下',
};

interface TrialForm {
  campusId: string;
  courseId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  reservationFeeYuan: string;
  reservationNotice: string;
  coverImageUrl: string;
  status: 'open' | 'closed' | 'cancelled';
}

interface ContractForm {
  courseId: string;
  classId: string;
  packageId: string;
  title: string;
  lessonCount: string;
  paidYuan: string;
  paymentMethod: string;
  school: string;
  note: string;
}

type ContractTarget =
  | { type: 'seat'; seatReservation: SeatReservation }
  | { type: 'lead'; lead: Lead };

const emptyContractForm: ContractForm = {
  courseId: '',
  classId: '',
  packageId: '',
  title: '',
  lessonCount: '',
  paidYuan: '',
  paymentMethod: 'wechat_offline',
  school: '',
  note: '',
};

function toDateTimeLocal(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function defaultForm(campuses: Campus[], courses: Course[]): TrialForm {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const end = new Date(now);
  end.setMinutes(end.getMinutes() + 60);
  return {
    campusId: campuses[0]?.id ?? '',
    courseId: courses[0]?.id ?? '',
    title: '',
    startsAt: toDateTimeLocal(now),
    endsAt: toDateTimeLocal(end),
    capacity: '8',
    reservationFeeYuan: '0',
    reservationNotice: '',
    coverImageUrl: '',
    status: 'open',
  };
}

export function TrialsPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<TrialSession>(TRIALS(), 'trialSessions');
  const { data: campuses } = useApiResource<Campus>('/v1/campuses', 'campuses');
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const { data: classes } = useApiResource<ClassGroup>('/v1/classes', 'classes');
  const { data: packages } = useApiResource<CoursePackage>('/v1/course-packages', 'coursePackages');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrialSession | null>(null);
  const [form, setForm] = useState<TrialForm>(defaultForm([], []));
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TrialSession | null>(null);
  const [qrSession, setQrSession] = useState<TrialSession | null>(null);
  const [qr, setQr] = useState<{ landingUrl: string; qrCodeDataUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [registrationSession, setRegistrationSession] = useState<TrialSession | null>(null);
  const [registrations, setRegistrations] = useState<Lead[]>([]);
  const [seatReservations, setSeatReservations] = useState<SeatReservation[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<SeatReservation | null>(null);
  const [rescheduleSessionId, setRescheduleSessionId] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [contractTarget, setContractTarget] = useState<ContractTarget | null>(null);
  const [contractForm, setContractForm] = useState<ContractForm>(emptyContractForm);
  const [contractSaving, setContractSaving] = useState(false);
  const contractSelectedPackage = packages.find((item) => item.id === contractForm.packageId);

  function applySeatReservationUpdate(payload: {
    seatReservation: SeatReservation;
    previousTrialSession?: TrialSession | null;
    trialSession?: TrialSession | null;
  }) {
    setSeatReservations((current) => {
      if (
        registrationSession &&
        payload.previousTrialSession?.id === registrationSession.id &&
        payload.seatReservation.trialSessionId !== registrationSession.id
      ) {
        return current.filter((item) => item.id !== payload.seatReservation.id);
      }
      return current.map((item) =>
        item.id === payload.seatReservation.id ? payload.seatReservation : item,
      );
    });

    const changedSessions = [payload.previousTrialSession, payload.trialSession].filter(
      Boolean,
    ) as TrialSession[];
    if (changedSessions.length > 0) {
      setData((current) =>
        current.map((item) => changedSessions.find((session) => session.id === item.id) ?? item),
      );
      const currentRegistrationSession = changedSessions.find(
        (session) => session.id === registrationSession?.id,
      );
      if (currentRegistrationSession) {
        setRegistrationSession(currentRegistrationSession);
      }
    }
  }

  async function runSeatReservationAction(
    seatReservation: SeatReservation,
    action: 'check-in' | 'no-show' | 'cancel',
  ) {
    const labels = {
      'check-in': '签到',
      'no-show': '标记缺席',
      cancel: '取消预约',
    } as const;
    try {
      const payload = await apiPost<{
        seatReservation: SeatReservation;
        trialSession?: TrialSession | null;
      }>(`/v1/seat-reservations/${seatReservation.id}/${action}`, {});
      applySeatReservationUpdate(payload);
      toast.success(`${labels[action]}成功`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${labels[action]}失败`);
    }
  }

  function rescheduleCandidates(seatReservation: SeatReservation | null) {
    if (!seatReservation?.courseId) return [];
    return data
      .filter(
        (session) =>
          session.status === 'open' &&
          session.courseId === seatReservation.courseId &&
          session.id !== seatReservation.trialSessionId &&
          new Date(session.startsAt).getTime() > Date.now() &&
          session.bookedCount < session.capacity,
      )
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  function canReschedule(row: SeatReservation) {
    return (
      row.paymentStatus === 'paid' &&
      row.reservationStatus === 'reserved' &&
      row.checkInStatus === 'pending' &&
      row.rescheduleCount < 1 &&
      (!row.cancelBefore || new Date(row.cancelBefore).getTime() > Date.now())
    );
  }

  function availablePackages(courseId: string) {
    return packages.filter(
      (coursePackage) => coursePackage.status === 'active' && coursePackage.courseId === courseId,
    );
  }

  function availableClasses(courseId: string) {
    return classes.filter(
      (classGroup) =>
        classGroup.courseId === courseId && !['archived', 'completed'].includes(classGroup.status),
    );
  }

  function applyContractPackage(next: ContractForm, coursePackage?: CoursePackage): ContractForm {
    if (!coursePackage) return next;
    return {
      ...next,
      packageId: coursePackage.id,
      title: next.title || coursePackage.name,
      lessonCount: String(coursePackage.lessonCount),
      paidYuan: String(coursePackage.priceAmount / 100),
    };
  }

  function defaultContractForm(courseId: string): ContractForm {
    const firstPackage = availablePackages(courseId)[0];
    const firstClass = availableClasses(courseId)[0];
    return applyContractPackage(
      {
        ...emptyContractForm,
        courseId,
        classId: firstClass?.id ?? '',
      },
      firstPackage,
    );
  }

  function openSeatContract(row: SeatReservation) {
    const courseId = row.courseId ?? registrationSession?.courseId ?? courses[0]?.id ?? '';
    setContractTarget({ type: 'seat', seatReservation: row });
    setContractForm(defaultContractForm(courseId));
  }

  function openLeadContract(row: Lead) {
    const courseId = row.courseId ?? registrationSession?.courseId ?? courses[0]?.id ?? '';
    setContractTarget({ type: 'lead', lead: row });
    setContractForm(defaultContractForm(courseId));
  }

  function handleContractCourseChange(courseId: string) {
    setContractForm(defaultContractForm(courseId));
  }

  function canConvertSeat(row: SeatReservation) {
    return (
      row.paymentStatus === 'paid' &&
      row.reservationStatus === 'reserved' &&
      row.checkInStatus === 'checked_in' &&
      Boolean(row.courseId ?? registrationSession?.courseId)
    );
  }

  function canCheckInLead(row: Lead) {
    return row.status === 'trial_booked';
  }

  function canConvertLead(row: Lead) {
    return (
      ['trial_attended', 'paid', 'course_delivery'].includes(row.status) &&
      !row.convertedStudentId &&
      Boolean(row.courseId ?? registrationSession?.courseId)
    );
  }

  function patchRegistrationLead(updated: Lead) {
    setRegistrations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function checkInLead(row: Lead) {
    try {
      const { lead } = await apiPost<{ lead: Lead }>(`/v1/crm/leads/${row.id}/trial-check-in`, {});
      patchRegistrationLead(lead);
      toast.success('签到成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '签到失败');
    }
  }

  async function submitContract() {
    if (!contractTarget) return;
    if (!contractForm.courseId) {
      toast.error('请选择正式课程');
      return;
    }
    const lessonCount = Number(contractForm.lessonCount);
    if (!Number.isInteger(lessonCount) || lessonCount <= 0) {
      toast.error('课时数必须大于 0');
      return;
    }

    const path =
      contractTarget.type === 'seat'
        ? `/v1/seat-reservations/${contractTarget.seatReservation.id}/course-contract`
        : `/v1/crm/leads/${contractTarget.lead.id}/course-contract`;
    setContractSaving(true);
    try {
      const payload = await apiPost<{
        courseContract: CourseContract;
        lead?: Lead | null;
      }>(path, {
        courseId: contractForm.courseId,
        classId: contractForm.classId || null,
        packageId: contractForm.packageId || null,
        title: contractForm.title.trim() || null,
        lessonCount,
        paidAmount: Math.round((Number(contractForm.paidYuan) || 0) * 100),
        paymentMethod: contractForm.paymentMethod,
        school: contractForm.school.trim() || null,
        note: contractForm.note.trim() || null,
      });
      if (payload.lead) {
        patchRegistrationLead(payload.lead);
      }
      toast.success('已创建正式课程档案，课时余额已更新');
      setContractTarget(null);
      setContractForm(emptyContractForm);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建正式课程档案失败');
    } finally {
      setContractSaving(false);
    }
  }

  function openReschedule(row: SeatReservation) {
    const candidates = rescheduleCandidates(row);
    setRescheduleTarget(row);
    setRescheduleSessionId(candidates[0]?.id ?? '');
  }

  async function submitReschedule() {
    if (!rescheduleTarget || !rescheduleSessionId) {
      toast.error('请选择目标场次');
      return;
    }
    setRescheduling(true);
    try {
      const payload = await apiPost<{
        seatReservation: SeatReservation;
        previousTrialSession?: TrialSession | null;
        trialSession: TrialSession;
      }>(`/v1/seat-reservations/${rescheduleTarget.id}/reschedule`, {
        trialSessionId: rescheduleSessionId,
      });
      applySeatReservationUpdate(payload);
      toast.success('改期成功');
      setRescheduleTarget(null);
      setRescheduleSessionId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '改期失败');
    } finally {
      setRescheduling(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(defaultForm(campuses, courses));
    setOpen(true);
  }

  function openEdit(session: TrialSession) {
    setEditing(session);
    setForm({
      campusId: session.campusId,
      courseId: session.courseId,
      title: session.title,
      startsAt: toDateTimeLocal(session.startsAt),
      endsAt: toDateTimeLocal(session.endsAt),
      capacity: String(session.capacity),
      reservationFeeYuan: String((session.reservationFeeAmount ?? 0) / 100),
      reservationNotice: session.reservationNotice ?? '',
      coverImageUrl: session.coverImageUrl ?? '',
      status: session.status as TrialForm['status'],
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.campusId || !form.courseId || !form.title.trim()) {
      toast.error('请填写标题并选择校区和课程');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        capacity: Number(form.capacity) || 8,
        reservationFeeAmount: Math.round((Number(form.reservationFeeYuan) || 0) * 100),
        reservationNotice: form.reservationNotice,
        coverImageUrl: form.coverImageUrl.trim() || null,
      };
      if (editing) {
        const { trialSession } = await apiPatch<{ trialSession: TrialSession }>(
          `${TRIALS()}/${editing.id}`,
          payload,
        );
        setData(data.map((item) => (item.id === trialSession.id ? trialSession : item)));
      } else {
        const { trialSession } = await apiPost<{ trialSession: TrialSession }>(TRIALS(), payload);
        setData([trialSession, ...data]);
      }
      toast.success('试听课已保存');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function cancelTrial() {
    if (!cancelTarget) return;
    try {
      const { trialSession } = await apiDelete<{ trialSession: TrialSession }>(
        `${TRIALS()}/${cancelTarget.id}`,
      );
      setData(data.map((item) => (item.id === trialSession.id ? trialSession : item)));
      setCancelTarget(null);
      toast.success('试听课已取消');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取消失败');
    }
  }

  async function openQr(session: TrialSession) {
    setQrSession(session);
    setQr(null);
    setQrLoading(true);
    try {
      setQr(
        await api<{ landingUrl: string; qrCodeDataUrl: string }>(
          `${TRIALS()}/${session.id}/qrcode`,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成二维码失败');
    } finally {
      setQrLoading(false);
    }
  }

  async function copyLanding() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.landingUrl);
      toast.success('试听链接已复制');
    } catch {
      toast.error('复制失败，请手动选择');
    }
  }

  async function openRegistrations(session: TrialSession) {
    setRegistrationSession(session);
    setRegistrations([]);
    setSeatReservations([]);
    setRegistrationsLoading(true);
    try {
      const [payload, reservationPayload] = await Promise.all([
        api<{ leads: Lead[] }>(`${TRIALS()}/${session.id}/registrations`),
        api<{ seatReservations: SeatReservation[] }>(
          `${TRIALS()}/${session.id}/seat-reservations`,
        ).catch(() => ({ seatReservations: [] })),
      ]);
      setRegistrations(payload.leads);
      setSeatReservations(reservationPayload.seatReservations);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '读取报名失败');
    } finally {
      setRegistrationsLoading(false);
    }
  }

  return (
    <PageFrame
      section="trials"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增试听
        </button>
      }
    >
      <DataTable
        columns={[
          { key: 'title', header: '试听课', cell: (row) => row.title },
          { key: 'time', header: '时间', cell: (row) => formatDateTime(row.startsAt) },
          { key: 'capacity', header: '报名', cell: (row) => `${row.bookedCount}/${row.capacity}` },
          {
            key: 'fee',
            header: '占位费',
            cell: (row) => (row.reservationFeeAmount ? money(row.reservationFeeAmount) : '-'),
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
          },
          {
            key: 'actions',
            header: '操作',
            cell: (row) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => openRegistrations(row)}
                >
                  <Users className="h-3.5 w-3.5" />
                  名单
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => openQr(row)}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  二维码
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
                {row.status !== 'cancelled' && (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-red-600"
                    onClick={() => setCancelTarget(row)}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    取消
                  </button>
                )}
              </div>
            ),
          },
        ]}
        data={data}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑试听课' : '新增试听课'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <Field label="标题" required>
          <input
            className="form-input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="校区" required>
            <select
              className="form-input"
              value={form.campusId}
              onChange={(event) => setForm({ ...form, campusId: event.target.value })}
            >
              <option value="">选择校区</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="课程" required>
            <select
              className="form-input"
              value={form.courseId}
              onChange={(event) => setForm({ ...form, courseId: event.target.value })}
            >
              <option value="">选择课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="开始时间" required>
            <input
              className="form-input"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
            />
          </Field>
          <Field label="结束时间" required>
            <input
              className="form-input"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="容量">
            <input
              className="form-input"
              type="number"
              value={form.capacity}
              onChange={(event) => setForm({ ...form, capacity: event.target.value })}
            />
          </Field>
          <Field label="状态">
            <select
              className="form-input"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as TrialForm['status'] })
              }
            >
              {(['open', 'closed', 'cancelled'] as const).map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="占位费(元)">
            <input
              className="form-input"
              type="number"
              value={form.reservationFeeYuan}
              onChange={(event) => setForm({ ...form, reservationFeeYuan: event.target.value })}
            />
          </Field>
          <Field label="占位费规则">
            <textarea
              className="form-input h-20"
              value={form.reservationNotice}
              onChange={(event) => setForm({ ...form, reservationNotice: event.target.value })}
            />
          </Field>
        </FieldRow>
        <QiniuImageField
          label="试听封面"
          hint="展示在首页公开课卡片和试听详情页"
          value={form.coverImageUrl}
          onChange={(coverImageUrl) => setForm({ ...form, coverImageUrl })}
          prefix="trials/cover"
        />
      </Drawer>

      <Drawer
        open={Boolean(registrationSession)}
        onClose={() => setRegistrationSession(null)}
        title="试听报名名单"
        description={registrationSession?.title}
      >
        {registrationsLoading ? (
          <p className="text-muted-foreground text-sm">加载中...</p>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-sm font-semibold">占位费预约</h3>
              <DataTable
                columns={[
                  {
                    key: 'student',
                    header: '学员',
                    cell: (row) => (
                      <div className="cell-stack">
                        <span className="cell-title">{row.studentName}</span>
                        <span className="cell-subtitle">{row.grade}</span>
                      </div>
                    ),
                  },
                  { key: 'guardian', header: '家长', cell: (row) => row.guardianName },
                  { key: 'fee', header: '占位费', cell: (row) => money(row.reservationFeeAmount) },
                  {
                    key: 'payment',
                    header: '支付',
                    cell: (row) => (
                      <StatusPill
                        tone={statusToTone(row.paymentStatus)}
                        label={row.paymentStatus}
                      />
                    ),
                  },
                  {
                    key: 'reservation',
                    header: '预约',
                    cell: (row) => (
                      <StatusPill
                        tone={statusToTone(row.reservationStatus)}
                        label={row.reservationStatus}
                      />
                    ),
                  },
                  {
                    key: 'checkIn',
                    header: '签到',
                    cell: (row) => (
                      <StatusPill
                        tone={statusToTone(row.checkInStatus)}
                        label={row.checkInStatus}
                      />
                    ),
                  },
                  {
                    key: 'reschedule',
                    header: '改期',
                    cell: (row) => `${row.rescheduleCount}/1`,
                  },
                  { key: 'phone', header: '手机号', cell: (row) => row.phone },
                  {
                    key: 'actions',
                    header: '操作',
                    cell: (row) => {
                      const canOperate =
                        row.paymentStatus === 'paid' && row.reservationStatus === 'reserved';
                      const canCancel =
                        row.reservationStatus !== 'cancelled' && row.checkInStatus !== 'checked_in';
                      return (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1"
                            disabled={!canReschedule(row)}
                            onClick={() => openReschedule(row)}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            改期
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1"
                            disabled={!canOperate || row.checkInStatus === 'checked_in'}
                            onClick={() => runSeatReservationAction(row, 'check-in')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            签到
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1"
                            disabled={!canConvertSeat(row)}
                            onClick={() => openSeatContract(row)}
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            转正式课
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1"
                            disabled={
                              !canOperate ||
                              row.checkInStatus === 'checked_in' ||
                              row.checkInStatus === 'no_show'
                            }
                            onClick={() => runSeatReservationAction(row, 'no-show')}
                          >
                            <UserX className="h-3.5 w-3.5" />
                            缺席
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1 text-red-600"
                            disabled={!canCancel}
                            onClick={() => runSeatReservationAction(row, 'cancel')}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            取消
                          </button>
                        </div>
                      );
                    },
                  },
                ]}
                data={seatReservations}
                emptyMessage="暂无占位费预约。"
              />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">普通预约线索</h3>
              <DataTable
                columns={[
                  {
                    key: 'student',
                    header: '学员',
                    cell: (row) => (
                      <div className="cell-stack">
                        <span className="cell-title">{row.studentName}</span>
                        <span className="cell-subtitle">{row.grade}</span>
                      </div>
                    ),
                  },
                  { key: 'guardian', header: '家长', cell: (row) => row.guardianName },
                  { key: 'phone', header: '手机号', cell: (row) => row.phone },
                  {
                    key: 'status',
                    header: '阶段',
                    cell: (row) => (
                      <StatusPill tone={statusToTone(row.status)} label={row.status} />
                    ),
                  },
                  { key: 'source', header: '来源', cell: (row) => row.source },
                  {
                    key: 'actions',
                    header: '操作',
                    cell: (row) => (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost px-2 py-1"
                          disabled={!canCheckInLead(row)}
                          onClick={() => checkInLead(row)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          签到
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-2 py-1"
                          disabled={!canConvertLead(row)}
                          onClick={() => openLeadContract(row)}
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          转正式课
                        </button>
                      </div>
                    ),
                  },
                ]}
                data={registrations}
                emptyMessage="还没有家长报名这节试听课。"
              />
            </section>
          </div>
        )}
      </Drawer>

      <Drawer
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="改期占位费预约"
        description={
          rescheduleTarget
            ? `${rescheduleTarget.studentName} / ${rescheduleTarget.guardianName}`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRescheduleTarget(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitReschedule}
              disabled={rescheduling || !rescheduleSessionId}
            >
              {rescheduling ? '改期中...' : '确认改期'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-800">
            仅支持开课前 12 小时以前改期一次。改期后原场次名额释放，目标场次名额占用。
          </div>
          <Field label="目标场次" required>
            <select
              className="form-input"
              value={rescheduleSessionId}
              onChange={(event) => setRescheduleSessionId(event.target.value)}
            >
              <option value="">选择目标场次</option>
              {rescheduleCandidates(rescheduleTarget).map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title} · {formatDateTime(session.startsAt)} · {session.bookedCount}/
                  {session.capacity}
                </option>
              ))}
            </select>
          </Field>
          {rescheduleTarget && rescheduleCandidates(rescheduleTarget).length === 0 && (
            <p className="text-muted-foreground text-sm">
              当前没有同课程、开放中且仍有名额的可改期场次。
            </p>
          )}
        </div>
      </Drawer>

      <Drawer
        open={Boolean(contractTarget)}
        onClose={() => setContractTarget(null)}
        title="转正式课程档案"
        description={
          contractTarget?.type === 'seat'
            ? `${contractTarget.seatReservation.studentName} / ${contractTarget.seatReservation.guardianName}`
            : contractTarget
              ? `${contractTarget.lead.studentName} / ${contractTarget.lead.guardianName}`
              : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setContractTarget(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitContract}
              disabled={contractSaving}
            >
              {contractSaving ? '创建中...' : '创建正式档案'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-muted-foreground rounded-lg bg-slate-50 px-3 py-2 text-sm">
            创建后会同步生成线下收款订单、课时余额和正式课程档案。
          </div>
          <Field label="正式课程" required>
            <select
              className="form-input"
              value={contractForm.courseId}
              onChange={(event) => handleContractCourseChange(event.target.value)}
            >
              <option value="">选择课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="课时包">
            <select
              className="form-input"
              value={contractForm.packageId}
              onChange={(event) => {
                const coursePackage = availablePackages(contractForm.courseId).find(
                  (item) => item.id === event.target.value,
                );
                setContractForm(
                  coursePackage
                    ? applyContractPackage(
                        { ...contractForm, packageId: '', title: '' },
                        coursePackage,
                      )
                    : { ...contractForm, packageId: '', title: '', lessonCount: '', paidYuan: '' },
                );
              }}
            >
              <option value="">自定义课时</option>
              {availablePackages(contractForm.courseId).map((coursePackage) => (
                <option key={coursePackage.id} value={coursePackage.id}>
                  {coursePackage.name} · {coursePackage.lessonCount} 节 ·{' '}
                  {money(coursePackage.priceAmount)}
                </option>
              ))}
            </select>
          </Field>
          {contractSelectedPackage && (
            <div className="text-muted-foreground rounded-lg bg-slate-50 px-3 py-2 text-sm">
              课时包展示价 {money(contractSelectedPackage.priceAmount)}，本次以线下实收为准。
            </div>
          )}
          <Field label="档案标题">
            <input
              className="form-input"
              value={contractForm.title}
              onChange={(event) => setContractForm({ ...contractForm, title: event.target.value })}
            />
          </Field>
          <FieldRow>
            <Field label="课时数" required>
              <input
                className="form-input"
                type="number"
                value={contractForm.lessonCount}
                onChange={(event) =>
                  setContractForm({ ...contractForm, lessonCount: event.target.value })
                }
              />
            </Field>
            <Field label="线下实收(元)">
              <input
                className="form-input"
                type="number"
                value={contractForm.paidYuan}
                onChange={(event) =>
                  setContractForm({ ...contractForm, paidYuan: event.target.value })
                }
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="班级">
              <select
                className="form-input"
                value={contractForm.classId}
                onChange={(event) =>
                  setContractForm({ ...contractForm, classId: event.target.value })
                }
              >
                <option value="">暂不入班</option>
                {availableClasses(contractForm.courseId).map((classGroup) => (
                  <option key={classGroup.id} value={classGroup.id}>
                    {classGroup.name} · {classGroup.enrolledCount}/{classGroup.capacity}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="支付方式">
              <select
                className="form-input"
                value={contractForm.paymentMethod}
                onChange={(event) =>
                  setContractForm({ ...contractForm, paymentMethod: event.target.value })
                }
              >
                {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </FieldRow>
          <Field label="学校(可选)">
            <input
              className="form-input"
              value={contractForm.school}
              onChange={(event) => setContractForm({ ...contractForm, school: event.target.value })}
            />
          </Field>
          <Field label="备注">
            <textarea
              className="form-input h-20"
              value={contractForm.note}
              onChange={(event) => setContractForm({ ...contractForm, note: event.target.value })}
            />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={Boolean(qrSession)}
        onClose={() => setQrSession(null)}
        title="试听课报名二维码"
        description={qrSession?.title}
      >
        {qrLoading ? (
          <p className="text-muted-foreground text-sm">生成中...</p>
        ) : qr ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-xl border bg-white p-4">
              <img src={qr.qrCodeDataUrl} alt="试听课二维码" className="h-56 w-56" />
            </div>
            <Field label="报名链接">
              <textarea className="form-input h-16" readOnly value={qr.landingUrl} />
            </Field>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={copyLanding}>
                复制链接
              </button>
              <a
                className="btn btn-primary flex-1"
                href={qr.qrCodeDataUrl}
                download={`${qrSession?.id ?? 'trial'}-qrcode.png`}
              >
                下载二维码
              </a>
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="取消试听课？"
        message={`确认取消「${cancelTarget?.title ?? ''}」？已有线索记录仍保留。`}
        confirmLabel="取消试听"
        danger
        onConfirm={cancelTrial}
        onCancel={() => setCancelTarget(null)}
      />
    </PageFrame>
  );
}
