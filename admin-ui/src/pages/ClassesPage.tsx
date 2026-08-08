import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';

import { api, apiDelete, apiPatch, apiPost } from '@/api/client';
import type {
  Campus,
  ClassGroup,
  Classroom,
  Course,
  CourseContract,
  Student,
  Teacher,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatPackageLessonBalance } from '@/lib/lesson-balance';
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
  billingCourseId: string;
  billingCourseContractId?: string | null;
  joinedAt: string;
  student?: Student;
  billingCourse?: Course | null;
  billingCourseContract?: CourseContract | null;
  lessonAccount?: { balance: number; courseId: string; course?: Course | null } | null;
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

function toDateTimeLocal(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const normalized = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(normalized.getTime() - normalized.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function ClassesPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<ClassGroup>(CLASSES(), 'classes');
  const { data: campuses } = useApiResource<Campus>('/v1/campuses', 'campuses');
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const { data: classrooms } = useApiResource<Classroom>('/v1/classrooms', 'classrooms');
  const { data: students } = useApiResource<Student>('/v1/students', 'students');
  const { data: courseContracts } = useApiResource<CourseContract>(
    '/v1/course-contracts',
    'courseContracts',
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassGroup | null>(null);
  const [form, setForm] = useState<ClassForm>(emptyClassForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassGroup | null>(null);

  const [enrollmentClass, setEnrollmentClass] = useState<ClassGroup | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [studentId, setStudentId] = useState('');
  const [billingCourseContractId, setBillingCourseContractId] = useState('');
  const [joinedAt, setJoinedAt] = useState(toDateTimeLocal());
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [updatingEnrollmentId, setUpdatingEnrollmentId] = useState('');

  useEffect(() => {
    if (!enrollmentClass) return;
    setLoadingEnrollments(true);
    api<{ enrollments: Enrollment[] }>(`${CLASSES()}/${enrollmentClass.id}/enrollments`)
      .then((payload) => setEnrollments(payload.enrollments))
      .catch(() => setEnrollments([]))
      .finally(() => setLoadingEnrollments(false));
  }, [enrollmentClass]);

  useEffect(() => {
    if (!studentId || !enrollmentClass) {
      setBillingCourseContractId('');
      return;
    }
    const options = billingAccountOptions(studentId);
    const defaultContractId =
      options.find((contract) => contract.courseId === enrollmentClass.courseId)?.id ??
      options[0]?.id ??
      '';
    setBillingCourseContractId(defaultContractId);
  }, [studentId, enrollmentClass]);

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
    const courseIds = classGroup.courseIds ?? [classGroup.courseId];
    return {
      ...classGroup,
      enrolledCount: enrolledCount ?? classGroup.enrolledCount ?? 0,
      courseIds,
      courses: courseIds
        .map((courseId) => courses.find((course) => course.id === courseId))
        .filter((course): course is Course => Boolean(course)),
      course: courses.find((item) => item.id === classGroup.courseId) ?? classGroup.course,
      teacher: teachers.find((item) => item.id === classGroup.teacherId) ?? classGroup.teacher,
      classroom:
        classrooms.find((item) => item.id === classGroup.classroomId) ?? classGroup.classroom,
    };
  }

  function billingAccountOptions(targetStudentId: string, currentContractId?: string | null) {
    return courseContracts
      .filter(
        (contract) =>
          contract.studentId === targetStudentId &&
          ((contract.status === 'active' && contract.remainingLessonCount > 0) ||
            contract.id === currentContractId),
      )
      .sort((left, right) => {
        const targetCourseId = enrollmentClass?.courseId;
        const courseOrder =
          Number(right.courseId === targetCourseId) - Number(left.courseId === targetCourseId);
        if (courseOrder !== 0) return courseOrder;
        const periodOrder =
          Number(right.package?.billingType === 'period') -
          Number(left.package?.billingType === 'period');
        if (periodOrder !== 0) return periodOrder;
        const expiryOrder =
          (left.endsAt ? new Date(left.endsAt).getTime() : Number.POSITIVE_INFINITY) -
          (right.endsAt ? new Date(right.endsAt).getTime() : Number.POSITIVE_INFINITY);
        if (expiryOrder !== 0) return expiryOrder;
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      });
  }

  function hydrateEnrollment(enrollment: Enrollment): Enrollment {
    const student = students.find((item) => item.id === enrollment.studentId) ?? enrollment.student;
    const lessonAccount =
      student?.lessonAccounts?.find((account) => account.courseId === enrollment.billingCourseId) ??
      enrollment.lessonAccount ??
      null;
    return {
      ...enrollment,
      student,
      billingCourse:
        courses.find((course) => course.id === enrollment.billingCourseId) ??
        lessonAccount?.course ??
        enrollment.billingCourse ??
        null,
      billingCourseContract:
        courseContracts.find((contract) => contract.id === enrollment.billingCourseContractId) ??
        enrollment.billingCourseContract ??
        null,
      lessonAccount,
    };
  }

  function addAssociatedCourseToClass(classId: string, courseId: string) {
    setData((current) =>
      current.map((item) => {
        if (item.id !== classId) return item;
        const courseIds = Array.from(new Set([...(item.courseIds ?? [item.courseId]), courseId]));
        return {
          ...item,
          courseIds,
          courses: courseIds
            .map((associatedCourseId) => courses.find((course) => course.id === associatedCourseId))
            .filter((course): course is Course => Boolean(course)),
        };
      }),
    );
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

  function openEnrollments(item: ClassGroup) {
    setStudentId('');
    setBillingCourseContractId('');
    setJoinedAt(toDateTimeLocal());
    setEnrollmentClass(item);
  }

  async function submit() {
    if (
      !form.campusId ||
      !form.courseId ||
      !form.teacherId ||
      !form.classroomId ||
      !form.name.trim()
    ) {
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

  async function deleteClass() {
    if (!deleteTarget) return;
    try {
      const { class: classGroup } = await apiDelete<{ class: ClassGroup }>(
        `${CLASSES()}/${deleteTarget.id}`,
      );
      setData(data.filter((item) => item.id !== classGroup.id));
      setDeleteTarget(null);
      toast.success('班级已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  async function addEnrollment() {
    if (!enrollmentClass || !studentId || !billingCourseContractId || !joinedAt) return;
    const contract = courseContracts.find((item) => item.id === billingCourseContractId);
    if (!contract) return;
    try {
      const { enrollment } = await apiPost<{ enrollment: Enrollment }>(
        `${CLASSES()}/${enrollmentClass.id}/enrollments`,
        {
          studentId,
          billingCourseId: contract.courseId,
          billingCourseContractId: contract.id,
          joinedAt: new Date(joinedAt).toISOString(),
        },
      );
      setEnrollments([hydrateEnrollment(enrollment), ...enrollments]);
      setData(
        data.map((item) =>
          item.id === enrollmentClass.id
            ? { ...item, enrolledCount: item.enrolledCount + 1 }
            : item,
        ),
      );
      addAssociatedCourseToClass(enrollmentClass.id, contract.courseId);
      setStudentId('');
      setBillingCourseContractId('');
      setJoinedAt(toDateTimeLocal());
      toast.success('已加入班级');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入班失败');
    }
  }

  async function updateEnrollmentJoinedAt(enrollment: Enrollment, nextJoinedAt: string) {
    if (!enrollmentClass || !nextJoinedAt || updatingEnrollmentId) return;
    const normalizedJoinedAt = new Date(nextJoinedAt).toISOString();
    if (normalizedJoinedAt === enrollment.joinedAt) return;
    setUpdatingEnrollmentId(enrollment.id);
    try {
      const { enrollment: updated } = await apiPatch<{ enrollment: Enrollment }>(
        `${CLASSES()}/${enrollmentClass.id}/enrollments/${enrollment.id}`,
        { joinedAt: normalizedJoinedAt },
      );
      setEnrollments((current) =>
        current.map((item) => (item.id === updated.id ? hydrateEnrollment(updated) : item)),
      );
      toast.success('入班生效时间已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入班生效时间更新失败');
    } finally {
      setUpdatingEnrollmentId('');
    }
  }

  async function updateEnrollmentBillingContract(
    enrollment: Enrollment,
    nextBillingCourseContractId: string,
  ) {
    const nextContract = courseContracts.find(
      (contract) => contract.id === nextBillingCourseContractId,
    );
    if (
      !enrollmentClass ||
      !nextContract ||
      nextBillingCourseContractId === enrollment.billingCourseContractId
    ) {
      return;
    }
    try {
      const { enrollment: updated } = await apiPatch<{ enrollment: Enrollment }>(
        `${CLASSES()}/${enrollmentClass.id}/enrollments/${enrollment.id}`,
        {
          billingCourseId: nextContract.courseId,
          billingCourseContractId: nextContract.id,
        },
      );
      setEnrollments((current) =>
        current.map((item) => (item.id === updated.id ? hydrateEnrollment(updated) : item)),
      );
      addAssociatedCourseToClass(enrollmentClass.id, nextContract.courseId);
      toast.success('扣课账户已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新扣课账户失败');
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
                <span className="cell-subtitle">
                  默认：{row.course?.name}
                  {(row.courses?.length ?? 0) > 1
                    ? ` · 自动关联 ${row
                        .courses!.filter((course) => course.id !== row.courseId)
                        .map((course) => course.name)
                        .join('、')}`
                    : ''}
                </span>
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
                  onClick={() => openEnrollments(row)}
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
              {(['recruiting', 'active', 'completed', 'paused', 'archived'] as const).map(
                (status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ),
              )}
            </select>
          </Field>
        </FieldRow>
      </Drawer>

      <Drawer
        open={Boolean(enrollmentClass)}
        onClose={() => setEnrollmentClass(null)}
        title={enrollmentClass ? `管理入班 - ${enrollmentClass.name}` : '管理入班'}
      >
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
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
          <Field label="扣课账户">
            <select
              className="form-input"
              value={billingCourseContractId}
              disabled={!studentId}
              onChange={(event) => setBillingCourseContractId(event.target.value)}
            >
              <option value="">选择扣课课包</option>
              {billingAccountOptions(studentId).map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.course?.name ?? contract.courseId} ·{' '}
                  {contract.package?.name ?? contract.title} · 余额{' '}
                  {formatPackageLessonBalance(contract.remainingLessonCount, contract.lessonCount)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="入班生效时间">
            <input
              className="form-input"
              type="datetime-local"
              step="60"
              value={joinedAt}
              onChange={(event) => setJoinedAt(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn btn-primary mb-3.5 shrink-0"
            onClick={addEnrollment}
            disabled={!billingCourseContractId}
          >
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
                className="resource-card grid gap-3 p-3 md:grid-cols-[minmax(8rem,1fr)_minmax(12rem,1.3fr)_minmax(12rem,1fr)_auto] md:items-end"
              >
                <div className="cell-stack">
                  <span className="cell-title">
                    {enrollment.student?.name ?? enrollment.studentId}
                  </span>
                  <span className="cell-subtitle">{enrollment.student?.grade ?? ''}</span>
                </div>
                <select
                  className="form-input max-w-xs"
                  value={enrollment.billingCourseContractId ?? ''}
                  onChange={(event) =>
                    updateEnrollmentBillingContract(enrollment, event.target.value)
                  }
                >
                  {billingAccountOptions(
                    enrollment.studentId,
                    enrollment.billingCourseContractId,
                  ).map((contract) => (
                    <option
                      key={contract.id}
                      value={contract.id}
                      disabled={
                        contract.id !== enrollment.billingCourseContractId &&
                        (contract.status !== 'active' || contract.remainingLessonCount <= 0)
                      }
                    >
                      扣 {contract.course?.name ?? contract.courseId} ·{' '}
                      {contract.package?.name ?? contract.title} · 余额{' '}
                      {formatPackageLessonBalance(
                        contract.remainingLessonCount,
                        contract.lessonCount,
                      )}
                    </option>
                  ))}
                </select>
                <label className="cell-stack min-w-52">
                  <span className="cell-subtitle">入班生效时间</span>
                  <input
                    className="form-input"
                    type="datetime-local"
                    step="60"
                    disabled={updatingEnrollmentId === enrollment.id}
                    value={toDateTimeLocal(enrollment.joinedAt)}
                    onChange={(event) => updateEnrollmentJoinedAt(enrollment, event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600 md:mb-1"
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
        open={Boolean(deleteTarget)}
        title="删除班级？"
        message={`确认删除「${deleteTarget?.name ?? ''}」？班级下的入班和课次记录会一并删除。`}
        confirmLabel="删除"
        danger
        onConfirm={deleteClass}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageFrame>
  );
}
