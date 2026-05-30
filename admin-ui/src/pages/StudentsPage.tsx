import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { apiPatch, apiPost } from '@/api/client';
import type { Student } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { tenantId } from '@/lib/foundation';
import { useApiResource } from '@/lib/useApiResource';

const STUDENTS = () => `/v1/tenants/${tenantId}/students`;

interface StudentForm {
  name: string;
  grade: string;
  school: string;
  guardianName: string;
  guardianPhone: string;
  status: 'active' | 'inactive';
}

const emptyForm: StudentForm = {
  name: '',
  grade: '',
  school: '',
  guardianName: '',
  guardianPhone: '',
  status: 'active',
};

export function StudentsPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<Student>(STUDENTS(), 'students');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(student: Student) {
    setEditing(student);
    setForm({
      name: student.name,
      grade: student.grade,
      school: student.school ?? '',
      guardianName: student.guardian?.name ?? '',
      guardianPhone: student.guardian?.phone ?? '',
      status: student.status as StudentForm['status'],
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim() || !form.grade.trim()) {
      toast.error('学员姓名和年级必填');
      return;
    }
    if (!editing && (!form.guardianName.trim() || !form.guardianPhone.trim())) {
      toast.error('新建学员时请填写家长姓名和手机号');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { student } = await apiPatch<{ student: Student }>(`${STUDENTS()}/${editing.id}`, {
          name: form.name.trim(),
          grade: form.grade.trim(),
          school: form.school.trim() || undefined,
          status: form.status,
        });
        setData(data.map((item) => (item.id === student.id ? { ...item, ...student } : item)));
      } else {
        const { student } = await apiPost<{ student: Student }>(STUDENTS(), {
          name: form.name.trim(),
          grade: form.grade.trim(),
          school: form.school.trim() || undefined,
          guardianName: form.guardianName.trim(),
          guardianPhone: form.guardianPhone.trim(),
          status: form.status,
        });
        setData([
          {
            ...student,
            guardian: { name: form.guardianName.trim(), phone: form.guardianPhone.trim() },
          },
          ...data,
        ]);
      }
      toast.success('学员已保存');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      section="students"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增学员
        </button>
      }
    >
      <DataTable
        columns={[
          {
            key: 'name',
            header: '学员',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">
                  {row.grade}
                  {row.school ? ` · ${row.school}` : ''}
                </span>
              </div>
            ),
          },
          {
            key: 'guardian',
            header: '家长',
            cell: (row) => `${row.guardian?.name ?? '-'} ${row.guardian?.phone ?? ''}`,
          },
          {
            key: 'lesson',
            header: '课时余额',
            cell: (row) => row.lessonAccounts?.map((account) => account.balance).join(' / ') || '0',
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
              <button
                type="button"
                className="btn btn-ghost px-2 py-1"
                onClick={() => openEdit(row)}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            ),
          },
        ]}
        data={data}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑学员' : '新增学员'}
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
        <FieldRow>
          <Field label="学员姓名" required>
            <input
              className="form-input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="年级 / 年龄" required>
            <input
              className="form-input"
              value={form.grade}
              onChange={(event) => setForm({ ...form, grade: event.target.value })}
            />
          </Field>
        </FieldRow>
        <Field label="学校">
          <input
            className="form-input"
            value={form.school}
            onChange={(event) => setForm({ ...form, school: event.target.value })}
          />
        </Field>
        {!editing && (
          <FieldRow>
            <Field label="家长姓名" required>
              <input
                className="form-input"
                value={form.guardianName}
                onChange={(event) => setForm({ ...form, guardianName: event.target.value })}
              />
            </Field>
            <Field label="家长手机号" required>
              <input
                className="form-input"
                value={form.guardianPhone}
                onChange={(event) => setForm({ ...form, guardianPhone: event.target.value })}
              />
            </Field>
          </FieldRow>
        )}
        <Field label="状态">
          <select
            className="form-input"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as StudentForm['status'] })
            }
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </Field>
      </Drawer>
    </PageFrame>
  );
}
