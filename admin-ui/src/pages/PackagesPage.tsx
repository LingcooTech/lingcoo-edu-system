import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Course, CoursePackage } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';
import { money } from '@/lib/utils';

const PKG_BASE = () => '/v1/course-packages';

interface PackageForm {
  name: string;
  description: string;
  courseId: string;
  lessonCount: string;
  priceYuan: string;
  status: 'active' | 'archived';
}

const emptyPackageForm: PackageForm = {
  name: '',
  description: '',
  courseId: '',
  lessonCount: '12',
  priceYuan: '0',
  status: 'active',
};

interface EmbeddedCreateAction {
  label: string;
  onClick: () => void;
}

export function PackagesPage({
  embedded = false,
  onCreateActionChange,
}: {
  embedded?: boolean;
  onCreateActionChange?: (action: EmbeddedCreateAction | null) => void;
} = {}) {
  const toast = useToast();
  const { data: packages, setData: setPackages } = useApiResource<CoursePackage>(
    PKG_BASE(),
    'coursePackages',
  );
  // 课程列表只用于「关联课程」下拉与列表展示，不在本页增删改。
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const courseName = useMemo(
    () => new Map(courses.map((course) => [course.id, course.name])),
    [courses],
  );

  const [editing, setEditing] = useState<CoursePackage | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PackageForm>(emptyPackageForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CoursePackage | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(emptyPackageForm);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!embedded) return;
    onCreateActionChange?.({ label: '新增课时包', onClick: openCreate });
    return () => onCreateActionChange?.(null);
  }, [embedded, onCreateActionChange, openCreate]);

  function openEdit(pkg: CoursePackage) {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? '',
      courseId: pkg.courseId ?? '',
      lessonCount: String(pkg.lessonCount),
      priceYuan: String(pkg.priceAmount / 100),
      status: (pkg.status as PackageForm['status']) ?? 'active',
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error('课时包名称必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        courseId: form.courseId || undefined,
        lessonCount: Number(form.lessonCount) || 1,
        priceAmount: Math.round((Number(form.priceYuan) || 0) * 100),
        status: form.status,
      };
      if (editing) {
        const { coursePackage } = await apiPatch<{ coursePackage: CoursePackage }>(
          `${PKG_BASE()}/${editing.id}`,
          payload,
        );
        setPackages(packages.map((item) => (item.id === coursePackage.id ? coursePackage : item)));
        toast.success('课时包已更新');
      } else {
        const { coursePackage } = await apiPost<{ coursePackage: CoursePackage }>(
          PKG_BASE(),
          payload,
        );
        setPackages([coursePackage, ...packages]);
        toast.success('课时包已创建');
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function deletePackage() {
    if (!deleteTarget) return;
    try {
      const { coursePackage } = await apiDelete<{ coursePackage: CoursePackage }>(
        `${PKG_BASE()}/${deleteTarget.id}`,
      );
      setPackages(packages.filter((item) => item.id !== coursePackage.id));
      setDeleteTarget(null);
      toast.success('课时包已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  const content = (
    <>
      <DataTable
        columns={[
          {
            key: 'name',
            header: '课时包',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">{row.description}</span>
              </div>
            ),
          },
          {
            key: 'course',
            header: '关联课程',
            cell: (row) => (row.courseId ? (courseName.get(row.courseId) ?? '-') : '通用'),
          },
          { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
          { key: 'price', header: '价格', cell: (row) => money(row.priceAmount) },
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
        data={packages}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑课时包' : '新增课时包'}
        description="课时包可用于线上售卖，也可用于线下收款后手动添加课时；公开端是否购买由业务开关控制。"
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
        <Field label="名称" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="关联课程" hint="可留空（通用课时包）">
          <select
            className="form-input"
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
          >
            <option value="">— 不关联 —</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </Field>
        <FieldRow>
          <Field label="课时数(节)">
            <input
              className="form-input"
              type="number"
              value={form.lessonCount}
              onChange={(e) => setForm({ ...form, lessonCount: e.target.value })}
            />
          </Field>
          <Field label="价格(元)">
            <input
              className="form-input"
              type="number"
              value={form.priceYuan}
              onChange={(e) => setForm({ ...form, priceYuan: e.target.value })}
            />
          </Field>
        </FieldRow>
        <Field label="状态">
          <select
            className="form-input"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as PackageForm['status'] })
            }
          >
            <option value="active">{statusLabel('active')}</option>
            <option value="archived">{statusLabel('archived')}</option>
          </select>
        </Field>
        <Field label="说明">
          <textarea
            className="form-input h-20"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除课时包？"
        message={`确认删除「${deleteTarget?.name ?? ''}」？如果已被订单引用，系统会阻止删除。`}
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deletePackage}
      />
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <PageFrame
      section="packages"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增课时包
        </button>
      }
    >
      {content}
    </PageFrame>
  );
}
