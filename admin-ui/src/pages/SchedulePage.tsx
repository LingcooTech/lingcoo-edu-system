import { useMemo, useState } from 'react';
import {
  Ban,
  CalendarDays,
  List,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Repeat,
  Trash2,
} from 'lucide-react';

import { api, apiDelete, apiPatch, apiPost } from '@/api/client';
import type {
  ClassGroup,
  ClassSession,
  Classroom,
  Course,
  CourseContract,
  Student,
  Teacher,
  TemporarySessionStudent,
} from '@/api/types';
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
  teacherIds: string[];
  classroomId: string;
  lessonUnits: number;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

interface BatchForm {
  classId: string;
  lessonUnits: number;
  startsOn: string;
  endsOn: string;
  mode: 'daily' | 'weekly';
  weekdays: number[];
  startTime: string;
  endTime: string;
  topic: string;
  teacherId: string;
  teacherIds: string[];
  skipConflicts: boolean;
}

interface TemporaryStudentForm {
  studentId: string;
  billingCourseContractId: string;
  note: string;
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

function normalizeTeacherIds(primaryTeacherId: string, teacherIds: string[] = []) {
  return Array.from(new Set([primaryTeacherId, ...teacherIds].filter(Boolean)));
}

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
  const firstClass = classes[0];
  const teacherId = firstClass?.teacherId ?? '';
  return {
    classId: firstClass?.id ?? '',
    lessonUnits: 1,
    startsOn: toDateKey(weekStart),
    endsOn: toDateKey(weekEnd),
    mode: 'weekly',
    weekdays: [today.getDay()],
    startTime: '16:00',
    endTime: '17:00',
    topic: '常规课',
    teacherId,
    teacherIds: teacherId ? [teacherId] : [],
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
    teacherIds: normalizeTeacherIds(firstClass?.teacherId ?? teachers[0]?.id ?? ''),
    classroomId: firstClass?.classroomId ?? classrooms[0]?.id ?? '',
    lessonUnits: 1,
    startsAt: toDateTimeLocal(now),
    endsAt: toDateTimeLocal(end),
    topic: '',
    status: 'scheduled',
  };
}

export function SchedulePage({
  embedded = false,
  onOpenAttendance,
}: {
  embedded?: boolean;
  onOpenAttendance?: (sessionId: string) => void;
} = {}) {
  const toast = useToast();
  const { data, setData } = useApiResource<ClassSession>(SESSIONS(), 'classSessions');
  const { data: classes } = useApiResource<ClassGroup>('/v1/classes', 'classes');
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const { data: classrooms } = useApiResource<Classroom>('/v1/classrooms', 'classrooms');
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const { data: courseContracts } = useApiResource<CourseContract>(
    '/v1/course-contracts',
    'courseContracts',
  );
  const { data: students } = useApiResource<Student>('/v1/students?scope=current', 'students');

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
  const [temporaryStudents, setTemporaryStudents] = useState<TemporarySessionStudent[]>([]);
  const [temporaryStudentForm, setTemporaryStudentForm] = useState<TemporaryStudentForm>({
    studentId: '',
    billingCourseContractId: '',
    note: '',
  });
  const [temporaryStudentsLoading, setTemporaryStudentsLoading] = useState(false);
  const [temporaryStudentSaving, setTemporaryStudentSaving] = useState(false);

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
  const courseById = useMemo(() => new Map(courses.map((item) => [item.id, item])), [courses]);

  function teacherOptionsForClass(classId: string) {
    const classGroup = classes.find((item) => item.id === classId);
    if (!classGroup) return teachers;

    const course = courseById.get(classGroup.courseId);
    if (course?.providerInstitutionId) {
      return teachers.filter((teacher) => teacher.institutionId === course.providerInstitutionId);
    }

    const classTeacher = teachers.find((teacher) => teacher.id === classGroup.teacherId);
    return classTeacher
      ? teachers.filter((teacher) => teacher.institutionId === classTeacher.institutionId)
      : teachers;
  }

  function scopedTeacherIds(classId: string, primaryTeacherId: string, teacherIds: string[]) {
    const allowedIds = new Set(teacherOptionsForClass(classId).map((teacher) => teacher.id));
    return normalizeTeacherIds(primaryTeacherId, teacherIds).filter((teacherId) =>
      allowedIds.has(teacherId),
    );
  }

  function scopedPrimaryTeacherId(classId: string, requestedTeacherId: string) {
    const options = teacherOptionsForClass(classId);
    if (options.some((teacher) => teacher.id === requestedTeacherId)) {
      return requestedTeacherId;
    }
    const classGroup = classes.find((item) => item.id === classId);
    const classTeacherId = classGroup?.teacherId;
    return classTeacherId && options.some((teacher) => teacher.id === classTeacherId)
      ? classTeacherId
      : (options[0]?.id ?? '');
  }

  const filteredSessions = useMemo(
    () =>
      data
        .filter((session) => {
          if (filters.classId && session.classId !== filters.classId) return false;
          if (filters.teacherId && !sessionTeacherIds(session).includes(filters.teacherId)) {
            return false;
          }
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

  function billingAccountOptions(studentId: string) {
    const classGroup = classes.find((item) => item.id === form.classId);
    const targetCourse = classGroup ? courseById.get(classGroup.courseId) : null;
    return courseContracts
      .filter(
        (contract) =>
          contract.studentId === studentId &&
          contract.status === 'active' &&
          contract.remainingLessonCount > 0,
      )
      .map((contract) => {
        const course = courseById.get(contract.courseId) ?? contract.course ?? null;
        const sameCourse = Boolean(targetCourse && course?.id === targetCourse.id);
        const sameSeries = Boolean(
          targetCourse?.courseSeriesId &&
          course?.courseSeriesId &&
          course.courseSeriesId === targetCourse.courseSeriesId,
        );
        const sameCategory = Boolean(
          targetCourse?.category && course?.category === targetCourse.category,
        );
        return {
          ...contract,
          course,
          recommended: sameCourse || sameSeries || sameCategory,
          sortScore:
            (contract.remainingLessonCount > 0 ? 10 : 0) +
            (sameCourse ? 4 : 0) +
            (sameSeries ? 3 : 0) +
            (sameCategory ? 1 : 0),
        };
      })
      .sort(
        (a, b) =>
          b.sortScore - a.sortScore || (a.course?.name ?? '').localeCompare(b.course?.name ?? ''),
      );
  }

  function selectTemporaryStudent(studentId: string) {
    const firstAvailableAccount = billingAccountOptions(studentId).find(
      (contract) => contract.remainingLessonCount > 0,
    );
    setTemporaryStudentForm({
      studentId,
      billingCourseContractId: firstAvailableAccount?.id ?? '',
      note: '',
    });
  }

  async function loadTemporaryStudents(sessionId: string) {
    setTemporaryStudentsLoading(true);
    try {
      const payload = await api<{ temporaryStudents: TemporarySessionStudent[] }>(
        `${SESSIONS()}/${sessionId}/temporary-students`,
      );
      setTemporaryStudents(payload.temporaryStudents);
    } catch (err) {
      setTemporaryStudents([]);
      toast.error(err instanceof Error ? err.message : '加载临时学员失败');
    } finally {
      setTemporaryStudentsLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(defaultForm(classes, teachers, classrooms));
    setTemporaryStudents([]);
    setTemporaryStudentForm({ studentId: '', billingCourseContractId: '', note: '' });
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

  function selectBatchClass(classId: string) {
    const classGroup = classes.find((item) => item.id === classId);
    const teacherId = scopedPrimaryTeacherId(classId, classGroup?.teacherId ?? batchForm.teacherId);
    setBatchForm({
      ...batchForm,
      classId,
      teacherId,
      teacherIds: scopedTeacherIds(classId, teacherId, [teacherId]),
    });
  }

  function changeMainTeacher(teacherId: string) {
    setForm({
      ...form,
      teacherId,
      teacherIds: scopedTeacherIds(form.classId, teacherId, form.teacherIds),
    });
  }

  function toggleSessionTeacher(teacherId: string) {
    if (teacherId === form.teacherId) {
      return;
    }
    const teacherIds = form.teacherIds.includes(teacherId)
      ? form.teacherIds.filter((item) => item !== teacherId)
      : [...form.teacherIds, teacherId];
    setForm({
      ...form,
      teacherIds: scopedTeacherIds(form.classId, form.teacherId, teacherIds),
    });
  }

  function changeBatchMainTeacher(teacherId: string) {
    setBatchForm({
      ...batchForm,
      teacherId,
      teacherIds: scopedTeacherIds(batchForm.classId, teacherId, batchForm.teacherIds),
    });
  }

  function toggleBatchTeacher(teacherId: string) {
    if (teacherId === batchForm.teacherId) {
      return;
    }
    const teacherIds = batchForm.teacherIds.includes(teacherId)
      ? batchForm.teacherIds.filter((item) => item !== teacherId)
      : [...batchForm.teacherIds, teacherId];
    setBatchForm({
      ...batchForm,
      teacherIds: scopedTeacherIds(batchForm.classId, batchForm.teacherId, teacherIds),
    });
  }

  function openEdit(session: ClassSession) {
    const classId = session.classId ?? '';
    const teacherId = scopedPrimaryTeacherId(classId, session.teacherId);
    const teacherIds = scopedTeacherIds(classId, teacherId, sessionTeacherIds(session));
    setEditing(session);
    setForm({
      classId,
      teacherId,
      teacherIds,
      classroomId: session.classroomId,
      lessonUnits: session.lessonUnits ?? 1,
      startsAt: toDateTimeLocal(session.startsAt),
      endsAt: toDateTimeLocal(session.endsAt),
      topic: session.topic,
      status: session.status as SessionForm['status'],
    });
    setTemporaryStudentForm({ studentId: '', billingCourseContractId: '', note: '' });
    void loadTemporaryStudents(session.id);
    setOpen(true);
  }

  function selectClass(classId: string) {
    const classGroup = classes.find((item) => item.id === classId);
    const teacherId = scopedPrimaryTeacherId(classId, classGroup?.teacherId ?? form.teacherId);
    setForm({
      ...form,
      classId,
      teacherId,
      teacherIds: scopedTeacherIds(classId, teacherId, [teacherId]),
      classroomId: classGroup?.classroomId ?? form.classroomId,
    });
  }

  function hydrateSession(session: ClassSession): ClassSession {
    const teacherIds = sessionTeacherIds(session);
    return {
      ...session,
      teacherIds,
      class:
        (session.classId ? classes.find((item) => item.id === session.classId) : undefined) ??
        session.class,
      teacher: teachers.find((item) => item.id === session.teacherId) ?? session.teacher,
      teachers:
        session.teachers ??
        teacherIds
          .map((teacherId) => {
            const teacher = teachers.find((item) => item.id === teacherId);
            return teacher
              ? {
                  id: teacher.id,
                  name: teacher.name,
                  role: teacherId === session.teacherId ? 'primary' : 'assistant',
                }
              : null;
          })
          .filter((teacher): teacher is NonNullable<typeof teacher> => teacher !== null),
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
      let createdSessionId = '';
      const payload = {
        ...form,
        teacherIds: scopedTeacherIds(form.classId, form.teacherId, form.teacherIds),
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
        createdSessionId = classSession.id;
      }
      toast.success('课次已保存');
      setOpen(false);
      if (createdSessionId) onOpenAttendance?.(createdSessionId);
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
        teacherIds: scopedTeacherIds(batchForm.classId, batchForm.teacherId, batchForm.teacherIds),
        topic: batchForm.topic.trim(),
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      setData([...classSessions.map((session) => hydrateSession(session)), ...data]);
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

  async function addTemporaryStudent() {
    if (!editing) return;
    if (!temporaryStudentForm.studentId || !temporaryStudentForm.billingCourseContractId) {
      toast.error('请选择临时学员和扣课账户');
      return;
    }
    setTemporaryStudentSaving(true);
    try {
      const { temporaryStudent } = await apiPost<{
        temporaryStudent: TemporarySessionStudent;
      }>(`${SESSIONS()}/${editing.id}/temporary-students`, {
        studentId: temporaryStudentForm.studentId,
        billingCourseContractId: temporaryStudentForm.billingCourseContractId,
        note: temporaryStudentForm.note.trim() || undefined,
      });
      setTemporaryStudents([...temporaryStudents, temporaryStudent]);
      setTemporaryStudentForm({ studentId: '', billingCourseContractId: '', note: '' });
      toast.success('临时学员已添加');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加临时学员失败');
    } finally {
      setTemporaryStudentSaving(false);
    }
  }

  async function removeTemporaryStudent(temporaryStudent: TemporarySessionStudent) {
    if (!editing) return;
    try {
      await apiDelete(`${SESSIONS()}/${editing.id}/temporary-students/${temporaryStudent.id}`);
      setTemporaryStudents(temporaryStudents.filter((item) => item.id !== temporaryStudent.id));
      toast.success('临时学员已移除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除临时学员失败');
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

  const temporaryBillingOptions = billingAccountOptions(temporaryStudentForm.studentId);
  const sessionTeacherOptions = teacherOptionsForClass(form.classId);
  const batchTeacherOptions = teacherOptionsForClass(batchForm.classId);
  const scopedSessionTeacherIds = scopedTeacherIds(form.classId, form.teacherId, form.teacherIds);
  const scopedBatchTeacherIds = scopedTeacherIds(
    batchForm.classId,
    batchForm.teacherId,
    batchForm.teacherIds,
  );

  function sessionTeacherIds(session: ClassSession) {
    return normalizeTeacherIds(
      session.teacherId,
      session.teacherIds ?? session.teachers?.map((teacher) => teacher.id) ?? [],
    );
  }

  function teacherNamesForSession(session: ClassSession) {
    const names =
      session.teachers?.map((teacher) => teacher.name).filter(Boolean) ??
      sessionTeacherIds(session)
        .map((teacherId) => teacherNameById.get(teacherId))
        .filter(Boolean);
    return names.length > 0 ? names.join('、') : (session.teacher?.name ?? '-');
  }

  const scheduleActions = (
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
  );

  return (
    <PageFrame
      section="schedule"
      actions={embedded ? undefined : scheduleActions}
      headerClassName={embedded ? 'hidden' : undefined}
      contentClassName={embedded ? 'pt-0' : undefined}
    >
      <div className="space-y-4">
        {embedded ? <div className="flex justify-end">{scheduleActions}</div> : null}
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
                      <div
                        key={session.id}
                        className="hover:border-primary/40 rounded-lg border border-slate-200 bg-slate-50 p-2 transition hover:bg-white"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => openEdit(session)}
                        >
                          <div className="text-xs font-semibold">
                            {toDateTimeLocal(session.startsAt).slice(11)} -{' '}
                            {toDateTimeLocal(session.endsAt).slice(11)}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-medium">
                            {session.topic}
                          </div>
                          <div className="text-muted-foreground mt-1 text-xs">
                            {(session.classId ? classNameById.get(session.classId) : null) ??
                              session.class?.name ??
                              '临时课次'}{' '}
                            · {teacherNamesForSession(session)}
                          </div>
                          <div className="text-muted-foreground mt-1 text-xs">
                            {classroomNameById.get(session.classroomId) ??
                              session.classroom?.name ??
                              '教室'}
                          </div>
                        </button>
                        {onOpenAttendance && session.status !== 'cancelled' ? (
                          <button
                            type="button"
                            className="btn btn-primary mt-2 w-full py-1 text-xs"
                            onClick={() => onOpenAttendance(session.id)}
                          >
                            点名
                          </button>
                        ) : null}
                      </div>
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
              { key: 'teacher', header: '老师', cell: (row) => teacherNamesForSession(row) },
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
                    {onOpenAttendance && row.status !== 'cancelled' ? (
                      <button
                        type="button"
                        className="btn btn-primary px-2 py-1"
                        onClick={() => onOpenAttendance(row.id)}
                      >
                        点名
                      </button>
                    ) : null}
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
        <Field label="每位学员扣课数量" required>
          <input
            className="form-input"
            type="number"
            min={0}
            max={10}
            step={1}
            value={form.lessonUnits}
            onChange={(event) => setForm({ ...form, lessonUnits: Number(event.target.value) })}
          />
          <div className="text-muted-foreground mt-1 text-xs">
            点名时按该数量扣减课程余额；填 0 表示本课次不扣课。
          </div>
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
          <Field label="主授课老师" required>
            <select
              className="form-input"
              value={form.teacherId}
              onChange={(event) => changeMainTeacher(event.target.value)}
            >
              <option value="">选择老师</option>
              {sessionTeacherOptions.map((teacher) => (
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
        <Field label="协同/替班老师">
          <div className="grid gap-2 sm:grid-cols-2">
            {sessionTeacherOptions.map((teacher) => {
              const checked = scopedSessionTeacherIds.includes(teacher.id);
              const isPrimary = teacher.id === form.teacherId;
              return (
                <label
                  key={teacher.id}
                  className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isPrimary}
                    onChange={() => toggleSessionTeacher(teacher.id)}
                  />
                  <span>{teacher.name}</span>
                  {isPrimary ? (
                    <span className="text-muted-foreground ml-auto text-xs">主老师</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </Field>
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
        {editing && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div>
              <div className="text-sm font-semibold">临时学员</div>
              <div className="text-muted-foreground mt-1 text-xs">
                仅加入当前课次；点名时按所选课时账户扣减，不改变班级正式学员。
              </div>
            </div>

            {temporaryStudentsLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中...
              </div>
            ) : temporaryStudents.length > 0 ? (
              <div className="space-y-2">
                {temporaryStudents.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {item.student?.name ?? '学员'}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        扣 {item.billingCourse?.name ?? item.billingCourseId}
                        {item.billingCourseContract?.package?.name
                          ? ` · ${item.billingCourseContract.package.name}`
                          : ''}
                        {typeof item.lessonAccount?.balance === 'number'
                          ? ` · 剩余 ${item.lessonAccount.balance} 课时`
                          : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => removeTemporaryStudent(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      移除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground rounded-md border border-dashed py-4 text-center text-xs">
                暂无临时学员
              </div>
            )}

            <div className="grid gap-2">
              <select
                className="form-input"
                value={temporaryStudentForm.studentId}
                onChange={(event) => selectTemporaryStudent(event.target.value)}
              >
                <option value="">选择学员</option>
                {students
                  .filter(
                    (student) => !temporaryStudents.some((item) => item.studentId === student.id),
                  )
                  .map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.grade}
                    </option>
                  ))}
              </select>
              <select
                className="form-input"
                value={temporaryStudentForm.billingCourseContractId}
                disabled={!temporaryStudentForm.studentId}
                onChange={(event) =>
                  setTemporaryStudentForm({
                    ...temporaryStudentForm,
                    billingCourseContractId: event.target.value,
                  })
                }
              >
                <option value="">选择扣课课包</option>
                {temporaryBillingOptions.map((account) => (
                  <option
                    key={account.id}
                    value={account.id}
                    disabled={account.remainingLessonCount <= 0}
                  >
                    {account.course?.name ?? account.courseId} ·{' '}
                    {account.package?.name ?? account.title} · 剩余 {account.remainingLessonCount}{' '}
                    课时
                    {account.recommended ? ' · 推荐' : ''}
                  </option>
                ))}
              </select>
              <input
                className="form-input"
                placeholder="备注，可不填"
                value={temporaryStudentForm.note}
                onChange={(event) =>
                  setTemporaryStudentForm({ ...temporaryStudentForm, note: event.target.value })
                }
              />
              <button
                type="button"
                className="btn btn-secondary justify-center"
                disabled={temporaryStudentSaving || !temporaryStudentForm.billingCourseContractId}
                onClick={addTemporaryStudent}
              >
                {temporaryStudentSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                添加临时学员
              </button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="快捷排课"
        description="按班级默认老师和教室批量生成课次；可追加协同/替班老师，遇到老师或教室冲突时可自动跳过。"
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
              onChange={(event) => selectBatchClass(event.target.value)}
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
          <Field label="每位学员扣课数量" required>
            <input
              className="form-input"
              type="number"
              min={0}
              max={10}
              step={1}
              value={batchForm.lessonUnits}
              onChange={(event) =>
                setBatchForm({ ...batchForm, lessonUnits: Number(event.target.value) })
              }
            />
            <div className="text-muted-foreground mt-1 text-xs">
              本批生成的所有课次统一使用该扣课数量。
            </div>
          </Field>
          <Field label="主授课老师">
            <select
              className="form-input"
              value={batchForm.teacherId}
              onChange={(event) => changeBatchMainTeacher(event.target.value)}
            >
              <option value="">使用班级默认老师</option>
              {batchTeacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="协同/替班老师">
            <div className="grid gap-2 sm:grid-cols-2">
              {batchTeacherOptions.map((teacher) => {
                const checked = scopedBatchTeacherIds.includes(teacher.id);
                const isPrimary = teacher.id === batchForm.teacherId;
                return (
                  <label
                    key={teacher.id}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPrimary}
                      onChange={() => toggleBatchTeacher(teacher.id)}
                    />
                    <span>{teacher.name}</span>
                    {isPrimary ? (
                      <span className="text-muted-foreground ml-auto text-xs">主老师</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
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
