import { useState } from 'react';
import { Ban, Pencil, Plus, QrCode, Users } from 'lucide-react';

import { api, apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Campus, Course, Lead, TrialSession } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

const TRIALS = () => '/v1/trial-sessions';

interface TrialForm {
  campusId: string;
  courseId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  status: 'open' | 'closed' | 'cancelled';
}

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
    status: 'open',
  };
}

export function TrialsPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<TrialSession>(TRIALS(), 'trialSessions');
  const { data: campuses } = useApiResource<Campus>('/v1/campuses', 'campuses');
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
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
  const [registrationsLoading, setRegistrationsLoading] = useState(false);

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
    setRegistrationsLoading(true);
    try {
      const payload = await api<{ leads: Lead[] }>(`${TRIALS()}/${session.id}/registrations`);
      setRegistrations(payload.leads);
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
              <option value="open">open</option>
              <option value="closed">closed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </Field>
        </FieldRow>
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
                cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
              },
              { key: 'source', header: '来源', cell: (row) => row.source },
            ]}
            data={registrations}
            emptyMessage="还没有家长报名这节试听课。"
          />
        )}
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
        message={`「${cancelTarget?.title ?? ''}」会标记为 cancelled，已有线索记录仍保留。`}
        confirmLabel="取消试听"
        danger
        onConfirm={cancelTrial}
        onCancel={() => setCancelTarget(null)}
      />
    </PageFrame>
  );
}
