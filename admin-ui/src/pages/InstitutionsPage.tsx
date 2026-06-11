import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Institution, InstitutionMediaItem } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field } from '@/components/shared/FormField';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

interface InstitutionForm {
  name: string;
  logoUrl: string;
  intro: string;
  qualificationItems: InstitutionMediaItem[];
  outcomeItems: InstitutionMediaItem[];
  contact: string;
  status: 'active' | 'archived';
}

const emptyForm: InstitutionForm = {
  name: '',
  logoUrl: '',
  intro: '',
  qualificationItems: [],
  outcomeItems: [],
  contact: '',
  status: 'active',
};

function institutionToForm(institution: Institution): InstitutionForm {
  return {
    name: institution.name,
    logoUrl: institution.logoUrl ?? '',
    intro: institution.intro ?? '',
    qualificationItems: normalizeMediaItems(institution.qualificationItems),
    outcomeItems: normalizeMediaItems(institution.outcomeItems),
    contact: institution.contact ?? '',
    status: institution.status as InstitutionForm['status'],
  };
}

function normalizeMediaItems(items?: InstitutionMediaItem[] | null) {
  return Array.isArray(items)
    ? items
        .map((item) => ({
          imageUrl: item.imageUrl?.trim() ?? '',
          caption: item.caption?.trim() ?? '',
        }))
        .filter((item) => item.imageUrl)
    : [];
}

export function InstitutionsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const toast = useToast();
  const { data, setData } = useApiResource<Institution>('/v1/institutions', 'institutions');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Institution | null>(null);
  const [form, setForm] = useState<InstitutionForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Institution | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(institution: Institution) {
    setEditing(institution);
    setForm(institutionToForm(institution));
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error('机构名称必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        logoUrl: form.logoUrl.trim(),
        intro: form.intro.trim(),
        qualificationItems: normalizeMediaItems(form.qualificationItems),
        outcomeItems: normalizeMediaItems(form.outcomeItems),
        contact: form.contact.trim(),
        status: form.status,
      };
      if (editing) {
        const { institution } = await apiPatch<{ institution: Institution }>(
          `/v1/institutions/${editing.id}`,
          payload,
        );
        setData(data.map((item) => (item.id === institution.id ? institution : item)));
        toast.success('机构已更新');
      } else {
        const { institution } = await apiPost<{ institution: Institution }>(
          '/v1/institutions',
          payload,
        );
        setData([...data, institution]);
        toast.success('机构已创建');
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function moveInstitution(institution: Institution, direction: -1 | 1) {
    const index = data.findIndex((item) => item.id === institution.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= data.length) return;

    const next = [...data];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);

    setSavingOrder(true);
    setData(next);
    try {
      const result = await apiPatch<{ institutions: Institution[] }>('/v1/institutions/order', {
        ids: next.map((item) => item.id),
      });
      setData(result.institutions);
      toast.success('机构排序已保存');
    } catch (err) {
      setData(data);
      toast.error(err instanceof Error ? err.message : '排序保存失败');
    } finally {
      setSavingOrder(false);
    }
  }

  async function deleteInstitution() {
    if (!deleteTarget) return;
    try {
      const { institution } = await apiDelete<{ institution: Institution }>(
        `/v1/institutions/${deleteTarget.id}`,
      );
      setData(data.filter((item) => item.id !== institution.id));
      setDeleteTarget(null);
      toast.success('机构已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  const page = (
    <PageFrame
      section="institutions"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增机构
        </button>
      }
    >
      <DataTable
        columns={[
          {
            key: 'name',
            header: '机构',
            cell: (row) => (
              <div className="flex items-center gap-2">
                {row.logoUrl ? (
                  <img
                    src={row.logoUrl}
                    alt={row.name}
                    className="h-8 w-8 rounded-lg border object-contain"
                  />
                ) : null}
                <span>{row.name}</span>
              </div>
            ),
          },
          { key: 'contact', header: '联系方式', cell: (row) => row.contact || '-' },
          {
            key: 'order',
            header: '排序',
            cell: (row) => {
              const index = data.findIndex((item) => item.id === row.id);
              return (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1"
                    disabled={savingOrder || index <= 0}
                    title="上移"
                    onClick={() => moveInstitution(row, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    <span className="sr-only">上移</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1"
                    disabled={savingOrder || index < 0 || index >= data.length - 1}
                    title="下移"
                    onClick={() => moveInstitution(row, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span className="sr-only">下移</span>
                  </button>
                </div>
              );
            },
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
        title={editing ? '编辑机构' : '新增机构'}
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
        <Field label="机构名称" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <QiniuImageField
          label="机构 Logo"
          hint="可选，展示在家长端机构标签与教师页"
          value={form.logoUrl}
          onChange={(logoUrl) => setForm({ ...form, logoUrl })}
          prefix="institutions/logo"
          previewAlt="机构 Logo"
        />
        <Field label="机构介绍">
          <textarea
            className="form-input h-28"
            value={form.intro}
            onChange={(event) => setForm({ ...form, intro: event.target.value })}
          />
        </Field>
        <InstitutionMediaEditor
          label="资质证明"
          value={form.qualificationItems}
          onChange={(qualificationItems) => setForm({ ...form, qualificationItems })}
          prefix="institutions/qualifications"
        />
        <InstitutionMediaEditor
          label="教学成果"
          value={form.outcomeItems}
          onChange={(outcomeItems) => setForm({ ...form, outcomeItems })}
          prefix="institutions/outcomes"
        />
        <Field label="联系方式" hint="电话、微信或地址等">
          <input
            className="form-input"
            value={form.contact}
            onChange={(event) => setForm({ ...form, contact: event.target.value })}
          />
        </Field>
        <Field label="状态">
          <select
            className="form-input"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as InstitutionForm['status'] })
            }
          >
            <option value="active">{statusLabel('active')}</option>
            <option value="archived">{statusLabel('archived')}</option>
          </select>
        </Field>
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除机构？"
        message={`确认删除「${deleteTarget?.name ?? ''}」？已绑定该机构的老师会解除绑定（保留老师档案）。`}
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteInstitution}
      />
    </PageFrame>
  );

  return embedded ? (
    <div className="[&_.page-header]:mb-3 [&_.page-header]:justify-end [&_.page-header]:border-b-0 [&_.page-header]:pb-0 [&_.page-header>div]:hidden [&_.page-shell]:p-0">
      {page}
    </div>
  ) : (
    page
  );
}

function InstitutionMediaEditor({
  label,
  value,
  onChange,
  prefix,
}: {
  label: string;
  value: InstitutionMediaItem[];
  onChange: (items: InstitutionMediaItem[]) => void;
  prefix: string;
}) {
  function patch(index: number, patchValue: Partial<InstitutionMediaItem>) {
    onChange(
      value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patchValue } : item)),
    );
  }

  return (
    <div className="mb-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <span className="form-label">{label}</span>
          <span className="form-hint">图片 + caption，用于前台机构详情页</span>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange([...value, { imageUrl: '', caption: '' }])}
        >
          <Plus className="h-4 w-4" />
          添加
        </button>
      </div>

      <div className="space-y-3">
        {value.map((item, index) => (
          <div key={index} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {label} {index + 1}
              </div>
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-red-600"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              >
                删除
              </button>
            </div>
            <QiniuImageField
              label="图片"
              value={item.imageUrl}
              onChange={(imageUrl) => patch(index, { imageUrl })}
              prefix={prefix}
              previewAlt={`${label}图片`}
            />
            <Field label="caption 说明">
              <input
                className="form-input"
                value={item.caption}
                onChange={(event) => patch(index, { caption: event.target.value })}
                placeholder="例如：办学许可证、课堂作品展、阶段测评成果等"
              />
            </Field>
          </div>
        ))}

        {value.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            暂未添加{label}
          </div>
        ) : null}
      </div>
    </div>
  );
}
