import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { CourseSeries } from '@/api/types';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const SERIES_BASE = () => '/v1/course-series';

interface SeriesForm {
  slug: string;
  name: string;
  description: string;
  sortOrder: string;
  status: 'active' | 'archived';
}

const emptySeriesForm: SeriesForm = {
  slug: '',
  name: '',
  description: '',
  sortOrder: '0',
  status: 'active',
};

interface EmbeddedCreateAction {
  label: string;
  onClick: () => void;
}

export function CourseSeriesPage({
  embedded = false,
  onCreateActionChange,
}: {
  embedded?: boolean;
  onCreateActionChange?: (action: EmbeddedCreateAction | null) => void;
} = {}) {
  const toast = useToast();
  const { data: courseSeries, setData: setCourseSeries } = useApiResource<CourseSeries>(
    SERIES_BASE(),
    'courseSeries',
  );
  const [editing, setEditing] = useState<CourseSeries | null>(null);
  const [form, setForm] = useState<SeriesForm>(emptySeriesForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CourseSeries | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(emptySeriesForm);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!embedded) return;
    onCreateActionChange?.({ label: '新增课程系列', onClick: openCreate });
    return () => onCreateActionChange?.(null);
  }, [embedded, onCreateActionChange, openCreate]);

  function openEdit(series: CourseSeries) {
    setEditing(series);
    setForm({
      slug: series.slug,
      name: series.name,
      description: series.description ?? '',
      sortOrder: String(series.sortOrder ?? 0),
      status: (series.status as SeriesForm['status']) ?? 'active',
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.slug.trim() || !form.name.trim()) {
      toast.error('系列标识和名称必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description,
        sortOrder: Number(form.sortOrder) || 0,
        status: form.status,
      };
      if (editing) {
        const { courseSeries: saved } = await apiPatch<{ courseSeries: CourseSeries }>(
          `${SERIES_BASE()}/${editing.id}`,
          payload,
        );
        setCourseSeries(courseSeries.map((item) => (item.id === saved.id ? saved : item)));
        toast.success('课程系列已更新');
      } else {
        const { courseSeries: created } = await apiPost<{ courseSeries: CourseSeries }>(
          SERIES_BASE(),
          payload,
        );
        setCourseSeries([created, ...courseSeries]);
        toast.success('课程系列已创建');
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function archiveSeries() {
    if (!deleteTarget) return;
    try {
      const { courseSeries: saved } = await apiDelete<{ courseSeries: CourseSeries }>(
        `${SERIES_BASE()}/${deleteTarget.id}`,
      );
      setCourseSeries(courseSeries.map((item) => (item.id === saved.id ? saved : item)));
      setDeleteTarget(null);
      toast.success('课程系列已归档');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    }
  }

  const content = (
    <>
      <DataTable
        columns={[
          {
            key: 'name',
            header: '课程系列',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">
                  {row.slug}
                  {row.description ? ` · ${row.description}` : ''}
                </span>
              </div>
            ),
          },
          { key: 'sort', header: '排序', cell: (row) => row.sortOrder },
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
                  归档
                </button>
              </div>
            ),
          },
        ]}
        data={courseSeries}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑课程系列' : '新增课程系列'}
        description="课程系列用于让同一类课程共享课时包，例如硬笔书法基础、进阶、控笔都可归到同一个硬笔书法系列。"
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
          <Field label="系列标识 slug" required>
            <input
              className="form-input"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </Field>
          <Field label="系列名称" required>
            <input
              className="form-input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="排序">
            <input
              className="form-input"
              type="number"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            />
          </Field>
          <Field label="状态">
            <select
              className="form-input"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as SeriesForm['status'] })
              }
            >
              <option value="active">{statusLabel('active')}</option>
              <option value="archived">{statusLabel('archived')}</option>
            </select>
          </Field>
        </FieldRow>
        <Field label="说明">
          <textarea
            className="form-input h-24"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="归档课程系列？"
        message={`确认归档「${deleteTarget?.name ?? ''}」？已关联课程和课时包会保留，后续可重新编辑启用。`}
        confirmLabel="归档"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={archiveSeries}
      />
    </>
  );

  return content;
}
