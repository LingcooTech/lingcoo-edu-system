import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { apiPatch, apiPost } from '@/api/client';
import type { Campus } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field } from '@/components/shared/FormField';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

interface CampusForm {
  name: string;
  address: string;
}

const emptyForm: CampusForm = {
  name: '',
  address: '',
};

function campusToForm(campus: Campus): CampusForm {
  return {
    name: campus.name,
    address: campus.address ?? '',
  };
}

export function CampusesPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<Campus>('/v1/campuses', 'campuses');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [form, setForm] = useState<CampusForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(campus: Campus) {
    setEditing(campus);
    setForm(campusToForm(campus));
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error('校区名称必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || null,
      };
      if (editing) {
        const { campus } = await apiPatch<{ campus: Campus }>(
          `/v1/campuses/${editing.id}`,
          payload,
        );
        setData(data.map((item) => (item.id === campus.id ? campus : item)));
        toast.success('校区已更新');
      } else {
        const { campus } = await apiPost<{ campus: Campus }>('/v1/campuses', payload);
        setData([campus, ...data]);
        toast.success('校区已创建');
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      section="campuses"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增校区
        </button>
      }
    >
      <DataTable
        columns={[
          { key: 'name', header: '校区', cell: (row) => row.name },
          { key: 'address', header: '地址', cell: (row) => row.address ?? '-' },
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
        title={editing ? '编辑校区' : '新增校区'}
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
        <Field label="校区名称" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="地址">
          <input
            className="form-input"
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </Field>
      </Drawer>
    </PageFrame>
  );
}
