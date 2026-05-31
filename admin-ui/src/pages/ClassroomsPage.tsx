import { useMemo, useState } from 'react';
import { Archive, Pencil, Plus } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Campus, Classroom } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const CLASSROOMS = () => '/v1/classrooms';

interface ClassroomForm {
  campusId: string;
  name: string;
  capacity: string;
  status: 'active' | 'archived';
}

const emptyClassroomForm: ClassroomForm = {
  campusId: '',
  name: '',
  capacity: '8',
  status: 'active',
};

export function ClassroomsPage() {
  const toast = useToast();
  const { data: classrooms, setData: setClassrooms } = useApiResource<Classroom>(
    CLASSROOMS(),
    'classrooms',
  );
  // 校区列表用于「所属校区」下拉与列表展示，校区在「校区」页维护。
  const { data: campuses } = useApiResource<Campus>('/v1/campuses', 'campuses');
  const campusName = useMemo(
    () => new Map(campuses.map((item) => [item.id, item.name])),
    [campuses],
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Classroom | null>(null);
  const [form, setForm] = useState<ClassroomForm>(emptyClassroomForm);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Classroom | null>(null);

  function openEditor(classroom?: Classroom) {
    setEditing(classroom ?? null);
    setForm(
      classroom
        ? {
            campusId: classroom.campusId,
            name: classroom.name,
            capacity: String(classroom.capacity),
            status: classroom.status as ClassroomForm['status'],
          }
        : { ...emptyClassroomForm, campusId: campuses[0]?.id ?? '' },
    );
    setOpen(true);
  }

  async function submit() {
    if (!form.campusId || !form.name.trim()) {
      toast.error('校区和教室名称必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        campusId: form.campusId,
        name: form.name.trim(),
        capacity: Number(form.capacity) || 8,
        status: form.status,
      };
      if (editing) {
        const { classroom } = await apiPatch<{ classroom: Classroom }>(
          `${CLASSROOMS()}/${editing.id}`,
          payload,
        );
        setClassrooms(classrooms.map((item) => (item.id === classroom.id ? classroom : item)));
      } else {
        const { classroom } = await apiPost<{ classroom: Classroom }>(CLASSROOMS(), payload);
        setClassrooms([classroom, ...classrooms]);
      }
      toast.success('教室已保存');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!archiveTarget) return;
    try {
      const { classroom } = await apiDelete<{ classroom: Classroom }>(
        `${CLASSROOMS()}/${archiveTarget.id}`,
      );
      setClassrooms(classrooms.map((item) => (item.id === classroom.id ? classroom : item)));
      setArchiveTarget(null);
      toast.success('教室已归档');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    }
  }

  return (
    <PageFrame
      section="classrooms"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => openEditor()}>
          <Plus className="h-4 w-4" />
          新增教室
        </button>
      }
    >
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
                  onClick={() => openEditor(row)}
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
        data={classrooms}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑教室' : '新增教室'}
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
        <Field label="教室名称" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
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
                setForm({ ...form, status: event.target.value as ClassroomForm['status'] })
              }
            >
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </Field>
        </FieldRow>
      </Drawer>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="归档教室？"
        message={`「${archiveTarget?.name ?? ''}」归档后不建议继续排课，历史课次仍保留。`}
        confirmLabel="归档"
        danger
        onConfirm={archive}
        onCancel={() => setArchiveTarget(null)}
      />
    </PageFrame>
  );
}
