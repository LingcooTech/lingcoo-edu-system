import { useMemo, useState } from 'react';
import { Ban, CalendarDays, List, Pencil, Plus, QrCode, Repeat, Trash2 } from 'lucide-react';

import { api, apiDelete, apiPatch, apiPost } from '@/api/client';
import type { ClassGroup, ClassSession, Classroom, Teacher } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

const SESSIONS = () => '/v1/class-sessions';

interface SessionForm {
  classId: string;
  teacherId: string;
  classroomId: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

interface BatchForm {
  classId: string;
  startsOn: string;
  endsOn: string;
  mode: 'daily' | 'weekly';
  weekdays: number[];
  startTime: string;
  endTime: string;
  topic: string;
  skipConflicts: boolean;
}

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
];

function toDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateTimeLocal(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

function defaultBatchForm(classes: ClassGroup[]): BatchForm {
  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 27);
  return {
    classId: classes[0]?.id ?? '',
    startsOn: toDateKey(weekStart),
    endsOn: toDateKey(weekEnd),
    mode: 'weekly',
    weekdays: [today.getDay()],
    startTime: '16:00',
    endTime: '17:00',
    topic: '常规课',
    skipConflicts: true,
  };
}

function defaultForm(
  classes: ClassGroup[],
  teachers: Teacher[],
  classrooms: Classroom[],
): SessionForm {
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
  const { data: classes } = useApiResource<ClassGroup>('/v1/classes', 'classes');
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const { data: classrooms } = useApiResource<Classroom>('/v1/classrooms', 'classrooms');

  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [weekStartKey, setWeekStartKey] = useState(toDateKey(startOfWeek(new Date())));
  const [filters, setFilters] = useState({
    classId: '',
    teacherId: '',
    classroomId: '',
    status: '',
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [form, setForm] = useState<SessionForm>(defaultForm([], [], []));
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchForm, setBatchForm] = useState<BatchForm>(defaultBatchForm([]));
  const [batchSaving, setBatchSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ClassSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [qrSession, setQrSession] = useState<ClassSession | null>(null);
  const [qr, setQr] = useState<{ landingUrl: string; qrCodeDataUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const classNameById = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes],
  );
  const teacherNameById = useMemo(
    () => new Map(teachers.map((item) => [item.id, item.name])),
    [teachers],
  );
  const classroomNameById = useMemo(
    () => new Map(classrooms.map((item) => [item.id, item.name])),
    [classrooms],
  );
  const filteredSessions = useMemo(
    () =>
      data
        .filter((session) => {
          if (filters.classId && session.classId !== filters.classId) return false;
          if (filters.teacherId && session.teacherId !== filters.teacherId) return false;
          if (filters.classroomId && session.classroomId !== filters.classroomId) return false;
          if (filters.status && session.status !== filters.status) return false;
          return true;
        })
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [data, filters],
  );
  const weekDays = useMemo(() => {
    const weekStart = new Date(`${weekStartKey}T00:00:00`);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [weekStartKey]);
  const weekSessions = useMemo(
    () =>
      weekDays.map((day) => {
        const key = toDateKey(day);
        return {
          key,
          date: day,
          sessions: filteredSessions.filter((session) => toDateKey(session.startsAt) === key),
        };
      }),
    [filteredSessions, weekDays],
  );

  function openCreate() {
    setEditing(null);
    setForm(defaultForm(classes, teachers, classrooms));
    setOpen(true);
  }

  function openBatch() {
    setBatchForm(defaultBatchForm(classes));
    setBatchOpen(true);
  }

  function toggleBatchWeekday(day: number) {
    setBatchForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((item) => item !== day)
        : [...current.weekdays, day],
    }));
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
        setData(
          data.map((item) => (item.id === classSession.id ? hydrateSession(classSession) : item)),
        );
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

  async function submitBatch() {
    if (!batchForm.classId || !batchForm.topic.trim()) {
      toast.error('请选择班级并填写课次主题');
      return;
    }
    if (batchForm.mode === 'weekly' && batchForm.weekdays.length === 0) {
      toast.error('请选择每周上课日');
      return;
    }
    setBatchSaving(true);
    try {
      const { classSessions, skipped } = await apiPost<{
        classSessions: ClassSession[];
        skipped: Array<{ date: string; reason: string }>;
      }>(`${SESSIONS()}/batch`, {
        ...batchForm,
        topic: batchForm.topic.trim(),
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      setData([
        ...classSessions.map((session) => hydrateSession(session)),
        ...data,
      ]);
      setBatchOpen(false);
      toast.success(
        `已生成 ${classSessions.length} 节课次${skipped.length ? `，跳过 ${skipped.length} 个冲突` : ''}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '快捷排课失败');
    } finally {
      setBatchSaving(false);
    }
  }

  async function cancelSession() {
    if (!cancelTarget) return;
    try {
      const { classSession } = await apiDelete<{ classSession: ClassSession }>(
        `${SESSIONS()}/${cancelTarget.id}`,
      );
      setData(
        data.map((item) => (item.id === classSession.id ? hydrateSession(classSession) : item)),
      );
      setCancelTarget(null);
      toast.success('课次已取消');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取消失败');
    }
  }

  async function deleteSession() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { classSession } = await apiDelete<{ classSession: ClassSession }>(
        `${SESSIONS()}/${deleteTarget.id}?mode=hard`,
      );
      setData(data.filter((item) => item.id !== classSession.id));
      setDeleteTarget(null);
      toast.success('课次已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  async function openQr(session: ClassSession) {
    setQrSession(session);
    setQr(null);
    setQrLoading(true);
    try {
      setQr(
        await api<{ landingUrl: string; qrCodeDataUrl: string }>(
          `${SESSIONS()}/${session.id}/checkin-qrcode`,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成签到码失败');
    } finally {
      setQrLoading(false);
    }
  }

  async function copyLanding() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.landingUrl);
      toast.success('签到链接已复制');
    } catch {
      toast.error('复制失败，请手动选择');
    }
  }

  return (
    <PageFrame
      section="schedule"
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={openBatch}>
            <Repeat className="h-4 w-4" />
            快捷排课
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增课次
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="resource-card p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <select
              className="form-input"
              value={filters.classId}
              onChange={(event) => setFilters({ ...filters, classId: event.target.value })}
            >
              <option value="">全部班级</option>
              {classes.map((classGroup) => (
                <option key={classGroup.id} value={classGroup.id}>
                  {classGroup.name}
                </option>
              ))}
            </select>
            <select
              className="form-input"
              value={filters.teacherId}
              onChange={(event) => setFilters({ ...filters, teacherId: event.target.value })}
            >
              <option value="">全部老师</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
            <select
              className="form-input"
              value={filters.classroomId}
              onChange={(event) => setFilters({ ...filters, classroomId: event.target.value })}
            >
              <option value="">全部教室</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
            <select
              className="form-input"
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              <option value="">全部状态</option>
              {(['scheduled', 'completed', 'cancelled'] as const).map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border p-1">
              <button
                type="button"
                className={`btn flex-1 px-3 py-1.5 ${viewMode === 'calendar' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('calendar')}
              >
                <CalendarDays className="h-4 w-4" />
                日历
              </button>
              <button
                type="button"
                className={`btn flex-1 px-3 py-1.5 ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
                列表
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="resource-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="text-sm font-semibold">
                {toDateKey(weekDays[0])} 至 {toDateKey(weekDays[6])}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setWeekStartKey(toDateKey(addDays(weekDays[0], -7)))}
                >
                  上一周
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setWeekStartKey(toDateKey(startOfWeek(new Date())))}
                >
                  本周
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setWeekStartKey(toDateKey(addDays(weekDays[0], 7)))}
                >
                  下一周
                </button>
              </div>
            </div>
            <div className="grid min-h-[28rem] gap-px bg-slate-200 lg:grid-cols-7">
              {weekSessions.map((day) => (
                <section key={day.key} className="bg-background min-h-40 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        {WEEKDAYS.find((item) => item.value === day.date.getDay())?.label}
                      </div>
                      <div className="text-muted-foreground text-xs">{day.key}</div>
                    </div>
                    <span className="text-muted-foreground text-xs">{day.sessions.length} 节</span>
                  </div>
                  <div className="space-y-2">
                    {day.sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition hover:border-primary/40 hover:bg-white"
                        onClick={() => openEdit(session)}
                      >
                        <div className="text-xs font-semibold">
                          {toDateTimeLocal(session.startsAt).slice(11)} -{' '}
                          {toDateTimeLocal(session.endsAt).slice(11)}
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm font-medium">{session.topic}</div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {classNameById.get(session.classId) ?? session.class?.name ?? '班级'} ·{' '}
                          {teacherNameById.get(session.teacherId) ?? session.teacher?.name ?? '老师'}
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {classroomNameById.get(session.classroomId) ??
                            session.classroom?.name ??
                            '教室'}
                        </div>
                      </button>
                    ))}
                    {day.sessions.length === 0 ? (
                      <div className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-xs">
                        暂无课次
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
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
                        className="btn btn-ghost px-2 py-1"
                        onClick={() => openQr(row)}
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        签到码
                      </button>
                    )}
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
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                ),
              },
            ]}
            data={filteredSessions}
          />
        )}
      </div>

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
          <select
            className="form-input"
            value={form.classId}
            onChange={(e) => selectClass(e.target.value)}
          >
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
              {(['scheduled', 'completed', 'cancelled'] as const).map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Drawer>

      <Drawer
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="快捷排课"
        description="按班级默认老师和教室批量生成课次；遇到老师或教室冲突时可自动跳过。"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setBatchOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitBatch}
              disabled={batchSaving}
            >
              {batchSaving ? '生成中...' : '生成课次'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="班级" required>
            <select
              className="form-input"
              value={batchForm.classId}
              onChange={(event) => setBatchForm({ ...batchForm, classId: event.target.value })}
            >
              <option value="">选择班级</option>
              {classes.map((classGroup) => (
                <option key={classGroup.id} value={classGroup.id}>
                  {classGroup.name}
                  {classGroup.teacher?.name ? ` · ${classGroup.teacher.name}` : ''}
                  {classGroup.classroom?.name ? ` · ${classGroup.classroom.name}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="课次主题" required>
            <input
              className="form-input"
              value={batchForm.topic}
              onChange={(event) => setBatchForm({ ...batchForm, topic: event.target.value })}
              placeholder="例如：常规课 / 第一阶段训练"
            />
          </Field>
          <FieldRow>
            <Field label="开始日期" required>
              <input
                className="form-input"
                type="date"
                value={batchForm.startsOn}
                onChange={(event) => setBatchForm({ ...batchForm, startsOn: event.target.value })}
              />
            </Field>
            <Field label="结束日期" required>
              <input
                className="form-input"
                type="date"
                value={batchForm.endsOn}
                onChange={(event) => setBatchForm({ ...batchForm, endsOn: event.target.value })}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="上课时间" required>
              <input
                className="form-input"
                type="time"
                value={batchForm.startTime}
                onChange={(event) => setBatchForm({ ...batchForm, startTime: event.target.value })}
              />
            </Field>
            <Field label="下课时间" required>
              <input
                className="form-input"
                type="time"
                value={batchForm.endTime}
                onChange={(event) => setBatchForm({ ...batchForm, endTime: event.target.value })}
              />
            </Field>
          </FieldRow>
          <Field label="排课频率">
            <div className="flex rounded-lg border p-1">
              {[
                { value: 'weekly', label: '按周' },
                { value: 'daily', label: '按天' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`btn flex-1 py-1.5 ${
                    batchForm.mode === item.value ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={() =>
                    setBatchForm({ ...batchForm, mode: item.value as BatchForm['mode'] })
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </Field>
          {batchForm.mode === 'weekly' && (
            <Field label="每周上课日" required>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={`btn px-3 py-1.5 ${
                      batchForm.weekdays.includes(day.value) ? 'btn-primary' : 'btn-secondary'
                    }`}
                    onClick={() => toggleBatchWeekday(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={batchForm.skipConflicts}
              onChange={(event) =>
                setBatchForm({ ...batchForm, skipConflicts: event.target.checked })
              }
            />
            遇到老师或教室时间冲突时跳过
          </label>
        </div>
      </Drawer>

      <Drawer
        open={Boolean(qrSession)}
        onClose={() => setQrSession(null)}
        title="课次签到码"
        description={qrSession ? `${qrSession.class?.name ?? '班级'} · ${qrSession.topic}` : ''}
      >
        {qrLoading ? (
          <p className="text-muted-foreground text-sm">生成中...</p>
        ) : qr ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-xl border bg-white p-4">
              <img src={qr.qrCodeDataUrl} alt="课次签到二维码" className="h-56 w-56" />
            </div>
            <Field label="签到链接">
              <textarea className="form-input h-16" readOnly value={qr.landingUrl} />
            </Field>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={copyLanding}>
                复制链接
              </button>
              <a
                className="btn btn-primary flex-1"
                href={qr.qrCodeDataUrl}
                download={`${qrSession?.id ?? 'class-session'}-checkin.png`}
              >
                下载二维码
              </a>
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="取消课次？"
        message={`确认取消「${cancelTarget?.topic ?? ''}」？历史排课记录仍保留。`}
        confirmLabel="取消课次"
        danger
        onConfirm={cancelSession}
        onCancel={() => setCancelTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除课次？"
        message={`确认删除「${deleteTarget?.topic ?? ''}」？该操作适用于误建课次，相关考勤记录会按系统约束处理。`}
        confirmLabel="删除"
        danger
        busy={deleting}
        onConfirm={deleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageFrame>
  );
}
