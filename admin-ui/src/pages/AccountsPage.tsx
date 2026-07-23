import { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2, Unlink } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Account, AccountRole, Guardian, Teacher, TeacherPermissions } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AdminTabs, type AdminTabItem } from '@/components/shared/AdminTabs';
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

type AccountRoleFilter = 'all' | AccountRole;

interface AccountForm {
  role: AccountRole;
  roles: AccountRole[];
  displayName: string;
  email: string;
  phone: string;
  status: 'active' | 'suspended';
  teacherId: string;
  guardianId: string;
  password: string;
  teacherPermissions: TeacherPermissions;
}

const emptyTeacherPermissions: TeacherPermissions = {
  createClassSession: false,
  createAdHocSession: false,
  manageSessionRoster: false,
  enrollStudents: false,
  viewAllStudents: false,
  setLessonUnits: false,
  manageClasses: false,
};

const teacherPermissionOptions: Array<{
  key: keyof TeacherPermissions;
  label: string;
  hint: string;
}> = [
  { key: 'createClassSession', label: '给已有班级排课', hint: '为自己负责的班级添加课次' },
  { key: 'createAdHocSession', label: '新建临时课次', hint: '不绑定正式班级的单次课程' },
  { key: 'viewAllStudents', label: '查看全部学员', hint: '排课时可搜索全部在读学员' },
  { key: 'manageSessionRoster', label: '调整课次学员', hint: '临时加入或移出本课次' },
  { key: 'enrollStudents', label: '正式拉学员入班', hint: '将学员加入自己负责的班级' },
  { key: 'setLessonUnits', label: '设置扣课数量', hint: '允许单次扣 0–10 课时' },
  { key: 'manageClasses', label: '管理正式班级', hint: '预留给后续老师新建班级功能' },
];

const emptyForm: AccountForm = {
  role: 'parent',
  roles: ['parent'],
  displayName: '',
  email: '',
  phone: '',
  status: 'active',
  teacherId: '',
  guardianId: '',
  password: '',
  teacherPermissions: emptyTeacherPermissions,
};

function accountRoles(account: Account): AccountRole[] {
  const assignments = account.roleAssignments ?? account.roles ?? [];
  const roles = assignments.map((assignment) => assignment.role);
  return roles.length ? roles : [account.role];
}

function accountHasRole(account: Account, role: AccountRole) {
  return accountRoles(account).includes(role);
}

function roleListLabel(account: Account) {
  return accountRoles(account)
    .map((role) => ROLE_LABEL[role])
    .join(' / ');
}

function accountToForm(account: Account): AccountForm {
  const teacherAssignment = (account.roleAssignments ?? account.roles ?? []).find(
    (assignment) => assignment.role === 'teacher',
  );
  return {
    role: account.role,
    roles: accountRoles(account),
    displayName: account.displayName,
    email: account.email ?? '',
    phone: account.phone ?? '',
    status: account.status,
    teacherId: account.teacherId ?? '',
    guardianId: account.guardianId ?? '',
    password: '',
    teacherPermissions: {
      ...emptyTeacherPermissions,
      ...(teacherAssignment?.teacherPermissions ?? {}),
    },
  };
}

function buildPayload(form: AccountForm, includePassword: boolean) {
  const primaryRole = form.roles.includes(form.role) ? form.role : (form.roles[0] ?? 'parent');
  return {
    role: primaryRole,
    roles: form.roles,
    displayName: form.displayName.trim(),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    status: form.status,
    teacherId: form.roles.includes('teacher') ? form.teacherId || undefined : null,
    guardianId: form.roles.includes('parent') ? form.guardianId || undefined : null,
    teacherPermissions: form.roles.includes('teacher') ? form.teacherPermissions : undefined,
    ...(includePassword && form.password.trim() ? { password: form.password.trim() } : {}),
  };
}

export function AccountsPage() {
  const toast = useToast();
  const { data: accounts, setData: setAccounts } = useApiResource<Account>(ACCOUNTS(), 'accounts');
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const { data: guardians } = useApiResource<Guardian>('/v1/guardians', 'guardians');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [unbindingWechatId, setUnbindingWechatId] = useState<string>('');
  const [activeRole, setActiveRole] = useState<AccountRoleFilter>('all');

  const teacherOptions = useMemo(
    () => teachers.filter((teacher) => teacher.status !== 'archived'),
    [teachers],
  );

  const roleCounts = useMemo(
    () => ({
      all: accounts.length,
      admin: accounts.filter((account) => accountHasRole(account, 'admin')).length,
      teacher: accounts.filter((account) => accountHasRole(account, 'teacher')).length,
      parent: accounts.filter((account) => accountHasRole(account, 'parent')).length,
    }),
    [accounts],
  );

  const roleTabs = useMemo<AdminTabItem<AccountRoleFilter>[]>(
    () => [
      { key: 'all', label: '全部账号', badge: roleCounts.all },
      { key: 'admin', label: ROLE_LABEL.admin, badge: roleCounts.admin },
      { key: 'teacher', label: ROLE_LABEL.teacher, badge: roleCounts.teacher },
      { key: 'parent', label: ROLE_LABEL.parent, badge: roleCounts.parent },
    ],
    [roleCounts],
  );

  const filteredAccounts = useMemo(
    () =>
      activeRole === 'all'
        ? accounts
        : accounts.filter((account) => accountHasRole(account, activeRole)),
    [accounts, activeRole],
  );

  function openCreate() {
    setEditing(null);
    const role = activeRole === 'all' ? 'parent' : activeRole;
    setForm({ ...emptyForm, role, roles: [role] });
    setDefaultPassword('');
    setOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm(accountToForm(account));
    setDefaultPassword('');
    setOpen(true);
  }

  function choosePrimaryRole(role: AccountRole) {
    setForm((current) => {
      if (role === 'parent') {
        return { ...current, role, roles: ['parent'], teacherId: '' };
      }
      const roles = current.roles.includes(role)
        ? current.roles.filter((item) => item !== 'parent')
        : [...current.roles.filter((item) => item !== 'parent'), role];
      return { ...current, role, roles: roles.length ? roles : [role], guardianId: '' };
    });
  }

  function toggleRole(role: AccountRole) {
    setForm((current) => {
      if (role === 'parent') {
        return { ...current, role: 'parent', roles: ['parent'], teacherId: '' };
      }

      const staffRoles = current.roles.filter((item) => item === 'admin' || item === 'teacher');
      const roles = staffRoles.includes(role)
        ? staffRoles.filter((item) => item !== role)
        : [...staffRoles, role];
      const nextRoles = roles.length ? roles : [role];
      const currentStaffRole =
        current.role === 'admin' || current.role === 'teacher' ? current.role : null;
      const nextPrimary =
        currentStaffRole && nextRoles.includes(currentStaffRole) ? currentStaffRole : nextRoles[0];
      return { ...current, role: nextPrimary, roles: nextRoles, guardianId: '' };
    });
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
    if (form.roles.includes('parent') && form.roles.length > 1) {
      toast.error('家长身份暂不支持叠加管理员或老师身份');
      return;
    }
    if (form.roles.includes('teacher') && !form.teacherId) {
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

  async function unbindWechat(account: Account) {
    const identity = account.wechatIdentities?.[0];
    if (!identity) return;
    setUnbindingWechatId(identity.id);
    try {
      await apiDelete(`/v1/accounts/${account.id}/wechat-identities/${identity.id}`);
      setAccounts(
        accounts.map((item) =>
          item.id === account.id
            ? {
                ...item,
                wechatIdentities: (item.wechatIdentities ?? []).filter(
                  (wechatIdentity) => wechatIdentity.id !== identity.id,
                ),
              }
            : item,
        ),
      );
      toast.success('微信绑定已解绑');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解绑失败');
    } finally {
      setUnbindingWechatId('');
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
      <AdminTabs
        tabs={roleTabs}
        activeKey={activeRole}
        onChange={setActiveRole}
        variant="table"
        className="mb-4"
      />
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
          { key: 'role', header: '身份', cell: (row) => roleListLabel(row) },
          {
            key: 'link',
            header: '关联档案',
            cell: (row) =>
              accountHasRole(row, 'teacher')
                ? (row.teacher?.name ?? '-')
                : accountHasRole(row, 'parent')
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
            key: 'wechat',
            header: '微信绑定',
            cell: (row) => {
              const identity = row.wechatIdentities?.[0];
              return identity ? (
                <div className="cell-stack">
                  <span className="cell-title">已绑定</span>
                  <span className="cell-subtitle">openid: {identity.openid.slice(-8)}</span>
                </div>
              ) : (
                '未绑定'
              );
            },
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
                {row.wechatIdentities?.length ? (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1"
                    disabled={unbindingWechatId === row.wechatIdentities[0].id}
                    onClick={() => unbindWechat(row)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    解绑微信
                  </button>
                ) : null}
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
        data={filteredAccounts}
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
          <Field label="默认身份" required>
            <select
              className="form-input"
              value={form.role}
              onChange={(event) => choosePrimaryRole(event.target.value as AccountRole)}
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
        <Field
          label="账号身份"
          hint="管理员和老师可以同时开通；家长身份保持独立，不参与工作台切换"
          required
        >
          <div className="grid grid-cols-3 gap-2">
            {(['admin', 'teacher', 'parent'] as AccountRole[]).map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700"
              >
                <input
                  type="checkbox"
                  checked={form.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {ROLE_LABEL[role]}
              </label>
            ))}
          </div>
        </Field>
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
        {form.roles.includes('teacher') && (
          <>
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
            <Field
              label="老师工作台权限"
              hint={
                form.roles.includes('admin')
                  ? '管理员 + 老师双重身份默认拥有全部权限'
                  : '普通授课老师按需开通'
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {teacherPermissionOptions.map((permission) => {
                  const adminTeacher = form.roles.includes('admin');
                  return (
                    <label
                      key={permission.key}
                      className="flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={adminTeacher || Boolean(form.teacherPermissions[permission.key])}
                        disabled={adminTeacher}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            teacherPermissions: {
                              ...form.teacherPermissions,
                              [permission.key]: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>
                        <span className="block text-sm font-semibold text-stone-700">
                          {permission.label}
                        </span>
                        <span className="block text-xs text-stone-500">{permission.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>
          </>
        )}
        {form.roles.includes('parent') && (
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
