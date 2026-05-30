import { useMemo, useState } from 'react';
import { Archive, Pencil, Plus } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Campus, Classroom, Teacher } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { tenantId } from '@/lib/foundation';
import { useApiResource } from '@/lib/useApiResource';

const TEACHERS = () => `/v1/tenants/${tenantId}/teachers`;
const CLASSROOMS = () => `/v1/tenants/${tenantId}/classrooms`;

interface TeacherForm {
  name: string;
  phone: string;
  specialties: string;
  status: 'active' | 'archived';
}

interface ClassroomForm {
  campusId: string;
  name: string;
  capacity: string;
  status: 'active' | 'archived';
}

const emptyTeacherForm: TeacherForm = {
  name: '',
  phone: '',
  specialties: '',
  status: 'active',
};

const emptyClassroomForm: ClassroomForm = {
  campusId: '',
  name: '',
  capacity: '8',
  status: 'active',
};

export function ResourcesPage() {
  const toast = useToast();
  const { data: teachers, setData: setTeachers } = useApiResource<Teacher>(
    TEACHERS(),
    'teachers',
  );
  const { data: classrooms, setData: setClassrooms } = useApiResource<Classroom>(
    CLASSROOMS(),
    'classrooms',
  );
  const { data: campuses } = useApiResource<Campus>(
    `/v1/tenants/${tenantId}/campuses`,
    'campuses',
  );
  const campusName = useMemo(() => new Map(campuses.map((item) => [item.id, item.name])), [campuses]);

  const [teacherOpen, setTeacherOpen] = useState(false);
  const [teacherEditing, setTeacherEditing] = useState<Teacher | null>(null);
  const [teacherForm, setTeacherForm] = useState<TeacherForm>(emptyTeacherForm);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [teacherArchive, setTeacherArchive] = useState<Teacher | null>(null);

  const [classroomOpen, setClassroomOpen] = useState(false);
  const [classroomEditing, setClassroomEditing] = useState<Classroom | null>(null);
  const [classroomForm, setClassroomForm] = useState<ClassroomForm>(emptyClassroomForm);
  const [savingClassroom, setSavingClassroom] = useState(false);
  const [classroomArchive, setClassroomArchive] = useState<Classroom | null>(null);

  function openTeacher(teacher?: Teacher) {
    setTeacherEditing(teacher ?? null);
    setTeacherForm(
      teacher
        ? {
            name: teacher.name,
            phone: teacher.phone ?? '',
            specialties: teacher.specialties.join('、'),
            status: teacher.status as TeacherForm['status'],
          }
        : emptyTeacherForm,
    );
    setTeacherOpen(true);
  }

  async function submitTeacher() {
    if (!teacherForm.name.trim()) {
      toast.error('老师姓名必填');
      return;
    }
    setSavingTeacher(true);
    try {
      const payload = {
        name: teacherForm.name.trim(),
        phone: teacherForm.phone.trim(),
        specialties: teacherForm.specialties
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
        status: teacherForm.status,
      };
      if (teacherEditing) {
        const { teacher } = await apiPatch<{ teacher: Teacher }>(
          `${TEACHERS()}/${teacherEditing.id}`,
          payload,
        );
        setTeachers(teachers.map((item) => (item.id === teacher.id ? teacher : item)));
      } else {
        const { teacher } = await apiPost<{ teacher: Teacher }>(TEACHERS(), payload);
        setTeachers([teacher, ...teachers]);
      }
      toast.success('老师已保存');
      setTeacherOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingTeacher(false);
    }
  }

  async function archiveTeacher() {
    if (!teacherArchive) return;
    try {
      const { teacher } = await apiDelete<{ teacher: Teacher }>(
        `${TEACHERS()}/${teacherArchive.id}`,
      );
      setTeachers(teachers.map((item) => (item.id === teacher.id ? teacher : item)));
      setTeacherArchive(null);
      toast.success('老师已归档');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    }
  }

  function openClassroom(classroom?: Classroom) {
    setClassroomEditing(classroom ?? null);
    setClassroomForm(
      classroom
        ? {
            campusId: classroom.campusId,
            name: classroom.name,
            capacity: String(classroom.capacity),
            status: classroom.status as ClassroomForm['status'],
          }
        : { ...emptyClassroomForm, campusId: campuses[0]?.id ?? '' },
    );
    setClassroomOpen(true);
  }

  async function submitClassroom() {
    if (!classroomForm.campusId || !classroomForm.name.trim()) {
      toast.error('校区和教室名称必填');
      return;
    }
    setSavingClassroom(true);
    try {
      const payload = {
        campusId: classroomForm.campusId,
        name: classroomForm.name.trim(),
        capacity: Number(classroomForm.capacity) || 8,
        status: classroomForm.status,
      };
      if (classroomEditing) {
        const { classroom } = await apiPatch<{ classroom: Classroom }>(
          `${CLASSROOMS()}/${classroomEditing.id}`,
          payload,
        );
        setClassrooms(classrooms.map((item) => (item.id === classroom.id ? classroom : item)));
      } else {
        const { classroom } = await apiPost<{ classroom: Classroom }>(CLASSROOMS(), payload);
        setClassrooms([classroom, ...classrooms]);
      }
      toast.success('教室已保存');
      setClassroomOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingClassroom(false);
    }
  }

  async function archiveClassroom() {
    if (!classroomArchive) return;
    try {
      const { classroom } = await apiDelete<{ classroom: Classroom }>(
        `${CLASSROOMS()}/${classroomArchive.id}`,
      );
      setClassrooms(classrooms.map((item) => (item.id === classroom.id ? classroom : item)));
      setClassroomArchive(null);
      toast.success('教室已归档');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    }
  }

  return (
    <PageFrame section="resources">
      <div className="grid gap-5 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">老师</h2>
            <button type="button" className="btn btn-secondary" onClick={() => openTeacher()}>
              <Plus className="h-4 w-4" />
              新增老师
            </button>
          </div>
          <DataTable
            columns={[
              { key: 'name', header: '老师', cell: (row) => row.name },
              { key: 'phone', header: '电话', cell: (row) => row.phone ?? '-' },
              { key: 'spec', header: '擅长', cell: (row) => row.specialties.join('、') || '-' },
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
                      onClick={() => openTeacher(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      编辑
                    </button>
                    {row.status !== 'archived' && (
                      <button
                        type="button"
                        className="btn btn-ghost px-2 py-1 text-red-600"
                        onClick={() => setTeacherArchive(row)}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        归档
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            data={teachers}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">教室</h2>
            <button type="button" className="btn btn-secondary" onClick={() => openClassroom()}>
              <Plus className="h-4 w-4" />
              新增教室
            </button>
          </div>
          <DataTable
            columns={[
              { key: 'name', header: '教室', cell: (row) => row.name },
              { key: 'campus', header: '校区', cell: (row) => campusName.get(row.campusId) ?? '-' },
              { key: 'capacity', header: '容量', cell: (row) => `${row.capacity} 人` },
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
                      onClick={() => openClassroom(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      编辑
                    </button>
                    {row.status !== 'archived' && (
                      <button
                        type="button"
                        className="btn btn-ghost px-2 py-1 text-red-600"
                        onClick={() => setClassroomArchive(row)}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        归档
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            data={classrooms}
          />
        </section>
      </div>

      <Drawer
        open={teacherOpen}
        onClose={() => setTeacherOpen(false)}
        title={teacherEditing ? '编辑老师' : '新增老师'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setTeacherOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitTeacher}
              disabled={savingTeacher}
            >
              {savingTeacher ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <Field label="姓名" required>
          <input
            className="form-input"
            value={teacherForm.name}
            onChange={(event) => setTeacherForm({ ...teacherForm, name: event.target.value })}
          />
        </Field>
        <Field label="电话">
          <input
            className="form-input"
            value={teacherForm.phone}
            onChange={(event) => setTeacherForm({ ...teacherForm, phone: event.target.value })}
          />
        </Field>
        <Field label="擅长" hint="用顿号或逗号分隔">
          <input
            className="form-input"
            value={teacherForm.specialties}
            onChange={(event) =>
              setTeacherForm({ ...teacherForm, specialties: event.target.value })
            }
          />
        </Field>
        <Field label="状态">
          <select
            className="form-input"
            value={teacherForm.status}
            onChange={(event) =>
              setTeacherForm({ ...teacherForm, status: event.target.value as TeacherForm['status'] })
            }
          >
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
        </Field>
      </Drawer>

      <Drawer
        open={classroomOpen}
        onClose={() => setClassroomOpen(false)}
        title={classroomEditing ? '编辑教室' : '新增教室'}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setClassroomOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitClassroom}
              disabled={savingClassroom}
            >
              {savingClassroom ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <Field label="校区" required>
          <select
            className="form-input"
            value={classroomForm.campusId}
            onChange={(event) =>
              setClassroomForm({ ...classroomForm, campusId: event.target.value })
            }
          >
            <option value="">选择校区</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="教室名称" required>
          <input
            className="form-input"
            value={classroomForm.name}
            onChange={(event) => setClassroomForm({ ...classroomForm, name: event.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="容量">
            <input
              className="form-input"
              type="number"
              value={classroomForm.capacity}
              onChange={(event) =>
                setClassroomForm({ ...classroomForm, capacity: event.target.value })
              }
            />
          </Field>
          <Field label="状态">
            <select
              className="form-input"
              value={classroomForm.status}
              onChange={(event) =>
                setClassroomForm({
                  ...classroomForm,
                  status: event.target.value as ClassroomForm['status'],
                })
              }
            >
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </Field>
        </FieldRow>
      </Drawer>

      <ConfirmDialog
        open={Boolean(teacherArchive)}
        title="归档老师？"
        message={`「${teacherArchive?.name ?? ''}」归档后不建议继续排课，历史课次仍保留。`}
        confirmLabel="归档"
        danger
        onConfirm={archiveTeacher}
        onCancel={() => setTeacherArchive(null)}
      />
      <ConfirmDialog
        open={Boolean(classroomArchive)}
        title="归档教室？"
        message={`「${classroomArchive?.name ?? ''}」归档后不建议继续排课，历史课次仍保留。`}
        confirmLabel="归档"
        danger
        onConfirm={archiveClassroom}
        onCancel={() => setClassroomArchive(null)}
      />
    </PageFrame>
  );
}
