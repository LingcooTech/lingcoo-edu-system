import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { apiPatch, apiPost } from '@/api/client';
import type { Guardian } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field } from '@/components/shared/FormField';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

interface GuardianForm {
  name: string;
  phone: string;
}

const emptyForm: GuardianForm = {
  name: '',
  phone: '',
};

function guardianToForm(guardian: Guardian): GuardianForm {
  return {
    name: guardian.name,
    phone: guardian.phone,
  };
}

export function GuardiansPage() {
  const toast = useToast();
  const { data: guardians, setData: setGuardians } = useApiResource<Guardian>(
    '/v1/guardians',
    'guardians',
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Guardian | null>(null);
  const [form, setForm] = useState<GuardianForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(guardian: Guardian) {
    setEditing(guardian);
    setForm(guardianToForm(guardian));
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim() || form.phone.trim().length < 6) {
      toast.error('家长姓名和手机号必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
      };
      if (editing) {
        const { guardian } = await apiPatch<{ guardian: Guardian }>(
          `/v1/guardians/${editing.id}`,
          payload,
        );
        setGuardians(guardians.map((item) => (item.id === guardian.id ? guardian : item)));
        toast.success('家长档案已更新');
      } else {
        const { guardian } = await apiPost<{ guardian: Guardian }>('/v1/guardians', payload);
        setGuardians([guardian, ...guardians]);
        toast.success('家长档案已创建');
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
      section="guardians"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增家长
        </button>
      }
    >
      <DataTable
        columns={[
          { key: 'name', header: '家长', cell: (row) => row.name },
          { key: 'phone', header: '手机号', cell: (row) => row.phone },
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
        data={guardians}
        emptyMessage="暂无家长档案"
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑家长档案' : '新增家长档案'}
        description="手机号是线索、联系人、家长账号和学员家长关系的去重锚点。"
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
        <Field label="家长姓名" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="手机号" required>
          <input
            className="form-input"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
      </Drawer>
    </PageFrame>
  );
}
