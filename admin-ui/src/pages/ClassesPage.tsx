import { useEffect, useState } from 'react';
import { Archive, Pencil, Plus, Users } from 'lucide-react';

import { api, apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Campus, ClassGroup, Classroom, Course, Student, Teacher } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const CLASSES = () => '/v1/classes';

interface ClassForm {
  campusId: string;
  courseId: string;
  teacherId: string;
  classroomId: string;
  name: string;
  capacity: string;
  status: 'recruiting' | 'active' | 'completed' | 'paused' | 'archived';
}

interface Enrollment {
  id: string;
  studentId: string;
  student?: Student;
}

const emptyClassForm: ClassForm = {
  campusId: '',
  courseId: '',
  teacherId: '',
  classroomId: '',
  name: '',
  capacity: '8',
  status: 'recruiting',
};

export function ClassesPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<ClassGroup>(CLASSES(), 'classes');
  const { data: campuses } = useApiResource<Campus>('/v1/campuses', 'campuses');
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const { data: classrooms } = useApiResource<Classroom>('/v1/classrooms', 'classrooms');
  const { data: students } = useApiResource<Student>('/v1/students', 'students');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassGroup | null>(null);
  const [form, setForm] = useState<ClassForm>(emptyClassForm);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ClassGroup | null>(null);

  const [enrollmentClass, setEnrollmentClass] = useState<ClassGroup | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [studentId, setStudentId] = useState('');
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  useEffect(() => {
    if (!enrollmentClass) return;
    setLoadingEnrollments(true);
    api<{ enrollments: Enrollment[] }>(`${CLASSES()}/${enrollmentClass.id}/enrollments`)
      .then((payload) => setEnrollments(payload.enrollments))
      .catch(() => setEnrollments([]))
      .finally(() => setLoadingEnrollments(false));
  }, [enrollmentClass]);

  function defaults(): ClassForm {
    return {
      ...emptyClassForm,
      campusId: campuses[0]?.id ?? '',
      courseId: courses[0]?.id ?? '',
      teacherId: teachers.find((item) => item.status !== 'archived')?.id ?? teachers[0]?.id ?? '',
      classroomId:
        classrooms.find((item) => item.status !== 'archived')?.id ?? classrooms[0]?.id ?? '',
    };
  }

  function hydrateClass(classGroup: ClassGroup, enrolledCount?: number): ClassGroup {
    return {
      ...classGroup,
      enrolledCount: enrolledCount ?? classGroup.enrolledCount ?? 0,
      course: courses.find((item) => item.id === classGroup.courseId) ?? classGroup.course,
      teacher: teachers.find((item) => item.id === classGroup.teacherId) ?? classGroup.teacher,
      classroom:
        classrooms.find((item) => item.id === classGroup.classroomId) ?? classGroup.classroom,
    };
  }

  function openCreate() {
    setEditing(null);
    setForm(defaults());
    setOpen(true);
  }

  function openEdit(item: ClassGroup) {
    setEditing(item);
    setForm({
      campusId: item.campusId,
      courseId: item.courseId,
      teacherId: item.teacherId,
      classroomId: item.classroomId,
      name: item.name,
      capacity: String(item.capacity),
      status: item.status as ClassForm['status'],
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.campusId || !form.courseId || !form.teacherId || !form.classroomId || !form.name.trim()) {
      toast.error('请填写班级名称并选择校区、课程、老师和教室');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), capacity: Number(form.capacity) || 8 };
      if (editing) {
        const { class: classGroup } = await apiPatch<{ class: ClassGroup }>(
          `${CLASSES()}/${editing.id}`,
          payload,
        );
        setData(
          data.map((item) =>
            item.id === classGroup.id ? hydrateClass(classGroup, item.enrolledCount) : item,
          ),
        );
      } else {
        const { class: classGroup } = await apiPost<{ class: ClassGroup }>(CLASSES(), payload);
        setData([hydrateClass(classGroup, 0), ...data]);
      }
      toast.success('班级已保存');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function archiveClass() {
    if (!archiveTarget) return;
    try {
      const { class: classGroup } = await apiDelete<{ class: ClassGroup }>(
        `${CLASSES()}/${archiveTarget.id}`,
      );
      setData(
        data.map((item) =>
          item.id === classGroup.id ? hydrateClass(classGroup, item.enrolledCount) : item,
        ),
      );
      setArchiveTarget(null);
      toast.success('班级已归档');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    }
  }

  async function addEnrollment() {
    if (!enrollmentClass || !studentId) return;
    try {
      const { enrollment } = await apiPost<{ enrollment: Enrollment }>(
        `${CLASSES()}/${enrollmentClass.id}/enrollments`,
        { studentId },
      );
      const student = students.find((item) => item.id === enrollment.studentId);
      setEnrollments([{ ...enrollment, student }, ...enrollments]);
      setData(
        data.map((item) =>
          item.id === enrollmentClass.id
            ? { ...item, enrolledCount: item.enrolledCount + 1 }
            : item,
        ),
      );
      setStudentId('');
      toast.success('已加入班级');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入班失败');
    }
  }

  async function removeEnrollment(enrollment: Enrollment) {
    if (!enrollmentClass) return;
    try {
      await apiDelete(`${CLASSES()}/${enrollmentClass.id}/enrollments/${enrollment.id}`);
      setEnrollments(enrollments.filter((item) => item.id !== enrollment.id));
      setData(
        data.map((item) =>
          item.id === enrollmentClass.id
            ? { ...item, enrolledCount: Math.max(0, item.enrolledCount - 1) }
            : item,
        ),
      );
      toast.success('已移出班级');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '退班失败');
    }
  }

  return (
    <PageFrame
      section="classes"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增班级
        </button>
      }
    >
      <DataTable
        columns={[
          {
            key: 'name',
            header: '班级',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">{row.course?.name}</span>
              </div>
            ),
          },
          { key: 'teacher', header: '老师', cell: (row) => row.teacher?.name ?? '-' },
          { key: 'room', header: '教室', cell: (row) => row.classroom?.name ?? '-' },
          {
            key: 'capacity',
            header: '人数',
            cell: (row) => `${row.enrolledCount}/${row.capacity}`,
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
                  onClick={() => setEnrollmentClass(row)}
                >
                  <Users className="h-3.5 w-3.5" />
                  入班
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
                {row.status !== 'archived' && (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-red-600"
                    onClick={() => setArchiveTarget(row)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    归档
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
        title={editing ? '编辑班级' : '新增班级'}
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
        <Field label="班级名称" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
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
                setForm({ ...form, status: event.target.value as ClassForm['status'] })
              }
            >
              <option value="recruiting">recruiting</option>
              <option value="active">active</option>
              <option value="completed">completed</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </Field>
        </FieldRow>
      </Drawer>

      <Drawer
        open={Boolean(enrollmentClass)}
        onClose={() => setEnrollmentClass(null)}
        title={enrollmentClass ? `管理入班 - ${enrollmentClass.name}` : '管理入班'}
      >
        <div className="mb-4 flex items-end gap-2">
          <Field label="选择学员">
            <select
              className="form-input"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">选择学员</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.grade}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="btn btn-primary mb-3.5 shrink-0" onClick={addEnrollment}>
            加入
          </button>
        </div>
        {loadingEnrollments ? (
          <p className="text-muted-foreground text-sm">加载中...</p>
        ) : (
          <div className="space-y-2">
            {enrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className="resource-card flex items-center justify-between gap-3 p-3"
              >
                <div className="cell-stack">
                  <span className="cell-title">{enrollment.student?.name ?? enrollment.studentId}</span>
                  <span className="cell-subtitle">{enrollment.student?.grade ?? ''}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600"
                  onClick={() => removeEnrollment(enrollment)}
                >
                  退班
                </button>
              </div>
            ))}
            {enrollments.length === 0 && (
              <p className="text-muted-foreground text-sm">暂无在班学员</p>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="归档班级？"
        message={`「${archiveTarget?.name ?? ''}」归档后不再作为可运营班级，历史课次仍保留。`}
        confirmLabel="归档"
        danger
        onConfirm={archiveClass}
        onCancel={() => setArchiveTarget(null)}
      />
    </PageFrame>
  );
}
