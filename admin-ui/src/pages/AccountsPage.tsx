import { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Account, AccountRole, Guardian, Teacher } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const ACCOUNTS = () => '/v1/accounts';

const ROLE_LABEL: Record<AccountRole, string> = {
  admin: '管理员',
  teacher: '老师',
  parent: '家长',
};

interface AccountForm {
  role: AccountRole;
  displayName: string;
  email: string;
  phone: string;
  status: 'active' | 'suspended';
  teacherId: string;
  guardianId: string;
  password: string;
}

const emptyForm: AccountForm = {
  role: 'parent',
  displayName: '',
  email: '',
  phone: '',
  status: 'active',
  teacherId: '',
  guardianId: '',
  password: '',
};

function accountToForm(account: Account): AccountForm {
  return {
    role: account.role,
    displayName: account.displayName,
    email: account.email ?? '',
    phone: account.phone ?? '',
    status: account.status,
    teacherId: account.teacherId ?? '',
    guardianId: account.guardianId ?? '',
    password: '',
  };
}

function buildPayload(form: AccountForm, includePassword: boolean) {
  return {
    role: form.role,
    displayName: form.displayName.trim(),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    status: form.status,
    teacherId: form.role === 'teacher' ? form.teacherId || undefined : null,
    guardianId: form.role === 'parent' ? form.guardianId || undefined : null,
    ...(includePassword && form.password.trim() ? { password: form.password.trim() } : {}),
  };
}

export function AccountsPage() {
  const toast = useToast();
  const { data: accounts, setData: setAccounts } = useApiResource<Account>(
    ACCOUNTS(),
    'accounts',
  );
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const { data: guardians } = useApiResource<Guardian>('/v1/guardians', 'guardians');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const teacherOptions = useMemo(
    () => teachers.filter((teacher) => teacher.status !== 'archived'),
    [teachers],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDefaultPassword('');
    setOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm(accountToForm(account));
    setDefaultPassword('');
    setOpen(true);
  }

  async function submit() {
    if (!form.displayName.trim()) {
      toast.error('账号名称必填');
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      toast.error('邮箱和手机号至少填写一个');
      return;
    }
    if (form.role === 'teacher' && !form.teacherId) {
      toast.error('老师账号必须关联老师档案');
      return;
    }

    setSaving(true);
    setDefaultPassword('');
    try {
      if (editing) {
        const { account } = await apiPatch<{ account: Account }>(
          `${ACCOUNTS()}/${editing.id}`,
          buildPayload(form, false),
        );
        setAccounts(accounts.map((item) => (item.id === account.id ? account : item)));
        toast.success('账号已更新');
      } else {
        const { account, defaultPassword: createdPassword } = await apiPost<{
          account: Account;
          defaultPassword: string;
        }>(ACCOUNTS(), buildPayload(form, true));
        setAccounts([account, ...accounts]);
        setDefaultPassword(createdPassword);
        toast.success('账号已创建');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(account: Account) {
    setDefaultPassword('');
    try {
      const result = await apiPost<{ account: Account; defaultPassword: string }>(
        `${ACCOUNTS()}/${account.id}/reset-password`,
        {},
      );
      setAccounts(accounts.map((item) => (item.id === result.account.id ? result.account : item)));
      setDefaultPassword(result.defaultPassword);
      setEditing(result.account);
      setForm(accountToForm(result.account));
      setOpen(true);
      toast.success('密码已重置');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置失败');
    }
  }

  async function deleteAccount() {
    if (!deleteTarget) return;
    try {
      const { account } = await apiDelete<{ account: Account }>(`${ACCOUNTS()}/${deleteTarget.id}`);
      setAccounts(accounts.filter((item) => item.id !== account.id));
      setDeleteTarget(null);
      toast.success('账号已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <PageFrame
      section="accounts"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          开通账号
        </button>
      }
    >
      <DataTable
        columns={[
          {
            key: 'account',
            header: '账号',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.displayName}</span>
                <span className="cell-subtitle">{row.email ?? row.phone ?? '-'}</span>
              </div>
            ),
          },
          { key: 'role', header: '角色', cell: (row) => ROLE_LABEL[row.role] },
          {
            key: 'link',
            header: '关联档案',
            cell: (row) =>
              row.role === 'teacher'
                ? row.teacher?.name ?? '-'
                : row.role === 'parent'
                  ? row.guardian
                    ? `${row.guardian.name} · ${row.guardian.phone}`
                    : '-'
                  : '-',
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
          },
          {
            key: 'password',
            header: '首登改密',
            cell: (row) => (row.mustChangePassword ? '是' : '否'),
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
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => resetPassword(row)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  重置
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
        data={accounts}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑账号' : '开通账号'}
        description="统一身份入口：管理员、老师、家长共用同一登录接口。"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              关闭
            </button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        {defaultPassword && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            默认密码：<span className="font-semibold">{defaultPassword}</span>。首次登录会强制修改。
          </div>
        )}
        <FieldRow>
          <Field label="角色" required>
            <select
              className="form-input"
              value={form.role}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value as AccountRole })
              }
            >
              <option value="admin">管理员</option>
              <option value="teacher">老师</option>
              <option value="parent">家长</option>
            </select>
          </Field>
          <Field label="状态">
            <select
              className="form-input"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as AccountForm['status'] })
              }
            >
              <option value="active">{statusLabel('active')} / 可登录</option>
              <option value="suspended">{statusLabel('suspended')}</option>
            </select>
          </Field>
        </FieldRow>
        <Field label="显示名称" required>
          <input
            className="form-input"
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="邮箱">
            <input
              className="form-input"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
          <Field label="手机号">
            <input
              className="form-input"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
        </FieldRow>
        {!editing && (
          <Field label="初始密码" hint="不填则使用手机号后 6 位；无手机号时生成 8 位临时密码">
            <input
              className="form-input"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </Field>
        )}
        {form.role === 'teacher' && (
          <Field label="关联老师档案" required>
            <select
              className="form-input"
              value={form.teacherId}
              onChange={(event) => setForm({ ...form, teacherId: event.target.value })}
            >
              <option value="">请选择老师档案</option>
              {teacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name} {teacher.phone ? `· ${teacher.phone}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.role === 'parent' && (
          <Field label="关联家长档案" hint="免登录成交会自动创建；这里可手动补关联">
            <select
              className="form-input"
              value={form.guardianId}
              onChange={(event) => setForm({ ...form, guardianId: event.target.value })}
            >
              <option value="">暂不关联</option>
              {guardians.map((guardian) => (
                <option key={guardian.id} value={guardian.id}>
                  {guardian.name} · {guardian.phone}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除账号？"
        message={`确认删除「${deleteTarget?.displayName ?? ''}」？该账号将无法继续登录。`}
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteAccount}
      />
    </PageFrame>
  );
}
