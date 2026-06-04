import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Teacher } from '@/api/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { parseBlocks, serializeBlocks, TEACHER_ALLOWED, type Block } from '@/components/editor/blocks';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field } from '@/components/shared/FormField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const TEACHERS = () => '/v1/teachers';

interface TeacherSaveResponse {
  teacher: Teacher;
  accountCreated?: boolean;
  defaultPassword?: string;
  accountWarning?: string;
}

interface TeacherForm {
  name: string;
  phone: string;
  title: string;
  avatarUrl: string;
  specialties: string;
  bioBlocks: Block[];
  status: 'active' | 'archived';
}

const emptyTeacherForm: TeacherForm = {
  name: '',
  phone: '',
  title: '',
  avatarUrl: '',
  specialties: '',
  bioBlocks: [],
  status: 'active',
};

export function TeachersPage() {
  const toast = useToast();
  const { data: teachers, setData: setTeachers } = useApiResource<Teacher>(TEACHERS(), 'teachers');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState<TeacherForm>(emptyTeacherForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);

  function openEditor(teacher?: Teacher) {
    setEditing(teacher ?? null);
    setForm(
      teacher
        ? {
            name: teacher.name,
            phone: teacher.phone ?? '',
            title: teacher.title ?? '',
            avatarUrl: teacher.avatarUrl ?? '',
            specialties: teacher.specialties.join('、'),
            bioBlocks: parseBlocks(teacher.bio),
            status: teacher.status as TeacherForm['status'],
          }
        : emptyTeacherForm,
    );
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error('老师姓名必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        title: form.title.trim(),
        avatarUrl: form.avatarUrl.trim(),
        specialties: form.specialties
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
        bio: serializeBlocks(form.bioBlocks),
        status: form.status,
      };
      if (editing) {
        const result = await apiPatch<TeacherSaveResponse>(`${TEACHERS()}/${editing.id}`, payload);
        setTeachers(teachers.map((item) => (item.id === result.teacher.id ? result.teacher : item)));
        surfaceSave(result);
      } else {
        const result = await apiPost<TeacherSaveResponse>(TEACHERS(), payload);
        setTeachers([result.teacher, ...teachers]);
        surfaceSave(result);
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  // A teacher with a phone number gets a login account auto-provisioned; show
  // the generated password (or a collision warning) so staff can hand it over.
  function surfaceSave(result: TeacherSaveResponse) {
    if (result.accountCreated && result.defaultPassword) {
      toast.success(
        `老师已保存；已自动创建登录账号，初始密码：${result.defaultPassword}（登录后请尽快修改）`,
      );
    } else {
      toast.success('老师已保存');
    }
    if (result.accountWarning) {
      toast.error(result.accountWarning);
    }
  }

  async function deleteTeacher() {
    if (!deleteTarget) return;
    try {
      const { teacher } = await apiDelete<{ teacher: Teacher }>(`${TEACHERS()}/${deleteTarget.id}`);
      setTeachers(teachers.filter((item) => item.id !== teacher.id));
      setDeleteTarget(null);
      toast.success('老师已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <PageFrame
      section="teachers"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => openEditor()}>
          <Plus className="h-4 w-4" />
          新增老师
        </button>
      }
    >
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
                  onClick={() => openEditor(row)}
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
        data={teachers}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑老师' : '新增老师'}
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
        <Field label="姓名" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="电话">
          <input
            className="form-input"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
        <Field label="职称 / 头衔" hint="如「教学主管」「资深书法老师」">
          <input
            className="form-input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <Field label="头像图片 URL" hint="可选，展示在家长端教师卡片">
          <input
            className="form-input"
            value={form.avatarUrl}
            onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })}
          />
        </Field>
        <Field label="擅长" hint="用顿号或逗号分隔">
          <input
            className="form-input"
            value={form.specialties}
            onChange={(event) => setForm({ ...form, specialties: event.target.value })}
          />
        </Field>
        <Field label="老师介绍" hint="用模块编排，展示在家长端教师页">
          <BlockEditor
            value={form.bioBlocks}
            onChange={(bioBlocks) => setForm({ ...form, bioBlocks })}
            allowed={TEACHER_ALLOWED}
          />
        </Field>
        <Field label="状态">
          <select
            className="form-input"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as TeacherForm['status'] })
            }
          >
            <option value="active">{statusLabel('active')}</option>
            <option value="archived">{statusLabel('archived')}</option>
          </select>
        </Field>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除老师？"
        message={`确认删除「${deleteTarget?.name ?? ''}」？如果老师已被班级或课次引用，系统会阻止删除。`}
        confirmLabel="删除"
        danger
        onConfirm={deleteTeacher}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageFrame>
  );
}
