import { useState } from 'react';
import { Ban, Pencil, Plus } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Campus, Course, TrialSession } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { tenantId } from '@/lib/foundation';
import { formatDateTime } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

const TRIALS = () => `/v1/tenants/${tenantId}/trial-sessions`;

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
  const { data: campuses } = useApiResource<Campus>(`/v1/tenants/${tenantId}/campuses`, 'campuses');
  const { data: courses } = useApiResource<Course>(`/v1/tenants/${tenantId}/courses`, 'courses');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrialSession | null>(null);
  const [form, setForm] = useState<TrialForm>(defaultForm([], []));
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TrialSession | null>(null);

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
          { key: 'title', header: '公开课', cell: (row) => row.title },
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
