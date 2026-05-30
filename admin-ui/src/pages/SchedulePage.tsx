import { useState } from 'react';
import { Ban, Pencil, Plus } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { ClassGroup, ClassSession, Classroom, Teacher } from '@/api/types';
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

const SESSIONS = () => `/v1/tenants/${tenantId}/class-sessions`;

interface SessionForm {
  classId: string;
  teacherId: string;
  classroomId: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

function toDateTimeLocal(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function defaultForm(classes: ClassGroup[], teachers: Teacher[], classrooms: Classroom[]): SessionForm {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const end = new Date(now);
  end.setMinutes(end.getMinutes() + 60);
  const firstClass = classes[0];
  return {
    classId: firstClass?.id ?? '',
    teacherId: firstClass?.teacherId ?? teachers[0]?.id ?? '',
    classroomId: firstClass?.classroomId ?? classrooms[0]?.id ?? '',
    startsAt: toDateTimeLocal(now),
    endsAt: toDateTimeLocal(end),
    topic: '',
    status: 'scheduled',
  };
}

export function SchedulePage() {
  const toast = useToast();
  const { data, setData } = useApiResource<ClassSession>(SESSIONS(), 'classSessions');
  const { data: classes } = useApiResource<ClassGroup>(`/v1/tenants/${tenantId}/classes`, 'classes');
  const { data: teachers } = useApiResource<Teacher>(
    `/v1/tenants/${tenantId}/teachers`,
    'teachers',
  );
  const { data: classrooms } = useApiResource<Classroom>(
    `/v1/tenants/${tenantId}/classrooms`,
    'classrooms',
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [form, setForm] = useState<SessionForm>(defaultForm([], [], []));
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ClassSession | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm(classes, teachers, classrooms));
    setOpen(true);
  }

  function openEdit(session: ClassSession) {
    setEditing(session);
    setForm({
      classId: session.classId,
      teacherId: session.teacherId,
      classroomId: session.classroomId,
      startsAt: toDateTimeLocal(session.startsAt),
      endsAt: toDateTimeLocal(session.endsAt),
      topic: session.topic,
      status: session.status as SessionForm['status'],
    });
    setOpen(true);
  }

  function selectClass(classId: string) {
    const classGroup = classes.find((item) => item.id === classId);
    setForm({
      ...form,
      classId,
      teacherId: classGroup?.teacherId ?? form.teacherId,
      classroomId: classGroup?.classroomId ?? form.classroomId,
    });
  }

  function hydrateSession(session: ClassSession): ClassSession {
    return {
      ...session,
      class: classes.find((item) => item.id === session.classId) ?? session.class,
      teacher: teachers.find((item) => item.id === session.teacherId) ?? session.teacher,
      classroom: classrooms.find((item) => item.id === session.classroomId) ?? session.classroom,
    };
  }

  async function submit() {
    if (!form.classId || !form.teacherId || !form.classroomId || !form.topic.trim()) {
      toast.error('请填写课次主题并选择班级、老师和教室');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        topic: form.topic.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      };
      if (editing) {
        const { classSession } = await apiPatch<{ classSession: ClassSession }>(
          `${SESSIONS()}/${editing.id}`,
          payload,
        );
        setData(data.map((item) => (item.id === classSession.id ? hydrateSession(classSession) : item)));
      } else {
        const { classSession } = await apiPost<{ classSession: ClassSession }>(SESSIONS(), payload);
        setData([hydrateSession(classSession), ...data]);
      }
      toast.success('课次已保存');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function cancelSession() {
    if (!cancelTarget) return;
    try {
      const { classSession } = await apiDelete<{ classSession: ClassSession }>(
        `${SESSIONS()}/${cancelTarget.id}`,
      );
      setData(data.map((item) => (item.id === classSession.id ? hydrateSession(classSession) : item)));
      setCancelTarget(null);
      toast.success('课次已取消');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取消失败');
    }
  }

  return (
    <PageFrame
      section="schedule"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增课次
        </button>
      }
    >
      <DataTable
        columns={[
          { key: 'time', header: '时间', cell: (row) => formatDateTime(row.startsAt) },
          {
            key: 'topic',
            header: '课次',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.topic}</span>
                <span className="cell-subtitle">{row.class?.name}</span>
              </div>
            ),
          },
          { key: 'teacher', header: '老师', cell: (row) => row.teacher?.name ?? '-' },
          { key: 'room', header: '教室', cell: (row) => row.classroom?.name ?? '-' },
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
        title={editing ? '编辑课次' : '新增课次'}
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
        <Field label="班级" required>
          <select className="form-input" value={form.classId} onChange={(e) => selectClass(e.target.value)}>
            <option value="">选择班级</option>
            {classes.map((classGroup) => (
              <option key={classGroup.id} value={classGroup.id}>
                {classGroup.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="主题" required>
          <input
            className="form-input"
            value={form.topic}
            onChange={(event) => setForm({ ...form, topic: event.target.value })}
          />
        </Field>
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
          <Field label="老师" required>
            <select
              className="form-input"
              value={form.teacherId}
              onChange={(event) => setForm({ ...form, teacherId: event.target.value })}
            >
              <option value="">选择老师</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="教室" required>
            <select
              className="form-input"
              value={form.classroomId}
              onChange={(event) => setForm({ ...form, classroomId: event.target.value })}
            >
              <option value="">选择教室</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        {editing && (
          <Field label="状态">
            <select
              className="form-input"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as SessionForm['status'] })
              }
            >
              <option value="scheduled">scheduled</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </Field>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="取消课次？"
        message={`「${cancelTarget?.topic ?? ''}」会标记为 cancelled，历史排课记录仍保留。`}
        confirmLabel="取消课次"
        danger
        onConfirm={cancelSession}
        onCancel={() => setCancelTarget(null)}
      />
    </PageFrame>
  );
}
