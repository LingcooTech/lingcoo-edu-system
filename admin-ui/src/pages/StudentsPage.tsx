import { useState } from 'react';
import { Archive, Download, Eye, Pencil, RotateCcw, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Account, CourseContract, Student } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { ResourceToolbar } from '@/components/shared/ResourceToolbar';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { exportStyledExcel } from '@/lib/excel-export';
import { useApiResource } from '@/lib/useApiResource';
import { CourseContractsPanel } from '@/pages/CourseContractsPage';
import { LessonAccountsPanel } from '@/pages/LessonsPage';

const STUDENTS = '/v1/students';
const ARCHIVED_STUDENTS = '/v1/students?scope=archived';
const STUDENT_TABS = [
  { key: 'profiles', label: '学员档案' },
  { key: 'history', label: '历史档案' },
  { key: 'parentAccounts', label: '家长账号' },
  { key: 'lessonAccounts', label: '课时账户' },
  { key: 'courseContracts', label: '正式课程档案' },
] as const;
type StudentTab = (typeof STUDENT_TABS)[number]['key'];

interface StudentForm {
  name: string;
  grade: string;
  school: string;
  guardianName: string;
  guardianPhone: string;
  createParentAccount: boolean;
  status: 'active' | 'inactive';
}

const emptyForm: StudentForm = {
  name: '',
  grade: '',
  school: '',
  guardianName: '',
  guardianPhone: '',
  createParentAccount: false,
  status: 'active',
};

interface StudentMutationResponse {
  student: Student;
  parentAccountCreated?: boolean;
  defaultPassword?: string;
}

export function StudentsPage() {
  const toast = useToast();
  const { data, setData } = useApiResource<Student>(STUDENTS, 'students');
  const { data: archivedData, setData: setArchivedData } = useApiResource<Student>(
    ARCHIVED_STUDENTS,
    'students',
  );
  const {
    data: courseContracts,
    loading: contractsLoading,
    error: contractsError,
  } = useApiResource<CourseContract>('/v1/course-contracts', 'courseContracts');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [selected, setSelected] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<Student | null>(null);
  const [hardDeleting, setHardDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudentTab>('profiles');
  const [exporting, setExporting] = useState(false);

  function contractsForStudent(studentId: string) {
    return courseContracts
      .filter((contract) => contract.studentId === studentId && contract.status !== 'cancelled')
      .sort((left, right) => {
        const courseOrder = (left.course?.name ?? '').localeCompare(right.course?.name ?? '');
        return (
          courseOrder || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        );
      });
  }

  function balanceCell(student: Student) {
    const contracts = contractsForStudent(student.id);
    if (contracts.length === 0) {
      return student.lessonAccounts?.length ? (
        <span>{student.lessonAccounts.map((account) => `${account.balance} 节`).join(' / ')}</span>
      ) : (
        <span>0 节</span>
      );
    }
    return (
      <div className="cell-stack">
        {contracts.map((contract) => (
          <span key={contract.id} className="text-xs">
            {contract.course?.name ?? '未命名课程'} / {contract.package?.name ?? contract.title}：
            {contract.remainingLessonCount} / {contract.lessonCount} 节
          </span>
        ))}
      </div>
    );
  }

  async function exportStudents(rows: Student[], archived = false) {
    if (contractsLoading) {
      toast.error('正式课程档案仍在加载，请稍后再导出');
      return;
    }
    if (contractsError) {
      toast.error('正式课程档案加载失败，暂不能生成完整导出');
      return;
    }
    if (rows.length === 0) {
      toast.error(archived ? '暂无历史档案可导出' : '暂无学员档案可导出');
      return;
    }

    setExporting(true);
    try {
      const dateKey = new Intl.DateTimeFormat('sv-SE').format(new Date());
      const contractsByStudentId = new Map<string, CourseContract[]>();
      for (const contract of courseContracts) {
        contractsByStudentId.set(contract.studentId, [
          ...(contractsByStudentId.get(contract.studentId) ?? []),
          contract,
        ]);
      }
      const studentContracts = (student: Student) => contractsByStudentId.get(student.id) ?? [];
      const actualPaidAmount = (contract: CourseContract) =>
        contract.order?.paidAmount ?? contract.paidAmount;
      const contractStatusLabel = (status: string) =>
        ({ active: '进行中', completed: '已完成', cancelled: '已取消' })[status] ?? status;
      await exportStyledExcel({
        filename: `${archived ? '历史学员档案' : '学员正式档案'}-${dateKey}`,
        sheetName: archived ? '历史学员档案' : '学员正式档案',
        title: archived ? '历史学员档案' : '学员正式档案',
        subtitle: archived
          ? '已归档学员信息、家长联系方式与课时余额'
          : '当前学员信息、家长联系方式与各课程课时余额',
        rows,
        columns: [
          {
            key: 'index',
            header: '序号',
            value: (_, index) => index + 1,
            width: 8,
            format: 'integer',
            alignment: 'center',
          },
          { key: 'name', header: '学员姓名', value: (student) => student.name, width: 14 },
          { key: 'grade', header: '年级 / 年龄', value: (student) => student.grade, width: 14 },
          { key: 'school', header: '学校', value: (student) => student.school || '-', width: 22 },
          {
            key: 'guardianName',
            header: '家长姓名',
            value: (student) => student.guardian?.name || '-',
            width: 14,
          },
          {
            key: 'guardianPhone',
            header: '家长手机号',
            value: (student) => student.guardian?.phone || '-',
            width: 18,
            format: 'text',
          },
          {
            key: 'courseBalances',
            header: '课程 / 课包与剩余课时',
            value: (student) => {
              const contracts = studentContracts(student).filter(
                (contract) => contract.status !== 'cancelled',
              );
              return contracts.length
                ? contracts
                    .map(
                      (contract) =>
                        `${contract.course?.name ?? '未命名课程'} / ${
                          contract.package?.name ?? contract.title
                        }：${contract.remainingLessonCount} 节`,
                    )
                    .join('\n')
                : '暂无课时包账户';
            },
            width: 40,
          },
          {
            key: 'totalBalance',
            header: '剩余课时合计',
            value: (student) =>
              studentContracts(student)
                .filter((contract) => contract.status !== 'cancelled')
                .reduce((sum, contract) => sum + contract.remainingLessonCount, 0),
            width: 14,
            format: 'integer',
            alignment: 'right',
          },
          {
            key: 'formalPackages',
            header: '正式课程 / 课包',
            value: (student) => {
              const contracts = studentContracts(student);
              return contracts.length
                ? contracts
                    .map(
                      (contract) =>
                        `${contract.course?.name ?? '未命名课程'} / ${
                          contract.package?.name ?? contract.title
                        }（${contractStatusLabel(contract.status)}，总 ${contract.lessonCount} / 已用 ${Math.max(
                          contract.lessonCount - contract.remainingLessonCount,
                          0,
                        )} / 剩 ${contract.remainingLessonCount} 节）`,
                    )
                    .join('\n')
                : '暂无正式课程档案';
            },
            width: 34,
          },
          {
            key: 'purchasedLessons',
            header: '正式档案总课时',
            value: (student) =>
              studentContracts(student).reduce((sum, contract) => sum + contract.lessonCount, 0),
            width: 15,
            format: 'integer',
            alignment: 'right',
          },
          {
            key: 'consumedLessons',
            header: '正式档案已用课时',
            value: (student) =>
              studentContracts(student).reduce(
                (sum, contract) =>
                  sum + Math.max(contract.lessonCount - contract.remainingLessonCount, 0),
                0,
              ),
            width: 15,
            format: 'integer',
            alignment: 'right',
          },
          {
            key: 'contractBalance',
            header: '正式档案剩余课时',
            value: (student) =>
              studentContracts(student).reduce(
                (sum, contract) => sum + contract.remainingLessonCount,
                0,
              ),
            width: 15,
            format: 'integer',
            alignment: 'right',
          },
          {
            key: 'actualPaidAmount',
            header: '累计实收费用',
            value: (student) =>
              studentContracts(student).reduce(
                (sum, contract) => sum + actualPaidAmount(contract),
                0,
              ) / 100,
            width: 16,
            format: 'currency',
            alignment: 'right',
          },
          {
            key: 'actualPaidDetails',
            header: '实收费用明细',
            value: (student) => {
              const contracts = studentContracts(student);
              return contracts.length
                ? contracts
                    .map(
                      (contract) =>
                        `${contract.package?.name ?? contract.title}：¥${(
                          actualPaidAmount(contract) / 100
                        ).toFixed(2)}`,
                    )
                    .join('\n')
                : '-';
            },
            width: 28,
          },
          {
            key: 'status',
            header: '档案状态',
            value: (student) => statusLabel(student.status),
            width: 12,
            alignment: 'center',
          },
          {
            key: 'createdAt',
            header: '建档时间',
            value: (student) => (student.createdAt ? new Date(student.createdAt) : null),
            width: 19,
            format: 'datetime',
            alignment: 'center',
          },
          {
            key: 'updatedAt',
            header: '最近更新',
            value: (student) => (student.updatedAt ? new Date(student.updatedAt) : null),
            width: 19,
            format: 'datetime',
            alignment: 'center',
          },
        ],
      });
      toast.success(`已导出 ${rows.length} 份${archived ? '历史' : '正式'}学员档案`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

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
      createParentAccount: false,
      status: student.status as StudentForm['status'],
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim() || !form.grade.trim()) {
      toast.error('学员姓名和年级必填');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { student, parentAccountCreated, defaultPassword } =
          await apiPatch<StudentMutationResponse>(`${STUDENTS}/${editing.id}`, {
            name: form.name.trim(),
            grade: form.grade.trim(),
            school: form.school.trim() || undefined,
            guardianName: form.guardianName.trim() || undefined,
            guardianPhone: form.guardianPhone.trim() || undefined,
            createParentAccount: form.createParentAccount,
            status: form.status,
          });
        setData(data.map((item) => (item.id === student.id ? { ...item, ...student } : item)));
        setSelected((current) =>
          current?.id === student.id ? { ...current, ...student } : current,
        );
        if (parentAccountCreated && defaultPassword) {
          toast.success(`家长账号已创建，默认密码：${defaultPassword}`);
        }
      } else {
        const { student, parentAccountCreated, defaultPassword } =
          await apiPost<StudentMutationResponse>(STUDENTS, {
            name: form.name.trim(),
            grade: form.grade.trim(),
            school: form.school.trim() || undefined,
            guardianName: form.guardianName.trim(),
            guardianPhone: form.guardianPhone.trim(),
            createParentAccount: form.createParentAccount,
            status: form.status,
          });
        setData([student, ...data]);
        if (parentAccountCreated && defaultPassword) {
          toast.success(`家长账号已创建，默认密码：${defaultPassword}`);
        }
      }
      toast.success('学员已保存');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function archiveStudent() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const targetId = archiveTarget.id;
      const { student } = await apiDelete<StudentMutationResponse>(`${STUDENTS}/${targetId}`);
      setArchivedData((current) => [
        { ...archiveTarget, ...student },
        ...current.filter((item) => item.id !== targetId),
      ]);
      setData((current) => current.filter((item) => item.id !== targetId));
      setArchiveTarget(null);
      setSelected((current) => (current?.id === targetId ? null : current));
      toast.success('学员已移入历史档案');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    } finally {
      setArchiving(false);
    }
  }

  async function restoreStudent(studentToRestore: Student) {
    setRestoringId(studentToRestore.id);
    try {
      const { student } = await apiPatch<StudentMutationResponse>(
        `${STUDENTS}/${studentToRestore.id}`,
        {
          status: 'active',
        },
      );
      const restoredStudent = { ...studentToRestore, ...student };
      setArchivedData((current) => current.filter((item) => item.id !== studentToRestore.id));
      setData((current) => [
        restoredStudent,
        ...current.filter((item) => item.id !== studentToRestore.id),
      ]);
      setSelected((current) => (current?.id === studentToRestore.id ? restoredStudent : current));
      toast.success('学员已恢复到当前档案');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setRestoringId(null);
    }
  }

  async function hardDeleteStudent() {
    if (!hardDeleteTarget) return;
    setHardDeleting(true);
    try {
      const targetId = hardDeleteTarget.id;
      await apiDelete(`${STUDENTS}/${targetId}/hard`);
      setArchivedData((current) => current.filter((item) => item.id !== targetId));
      setHardDeleteTarget(null);
      setSelected((current) => (current?.id === targetId ? null : current));
      toast.success('学员已永久删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setHardDeleting(false);
    }
  }

  return (
    <PageFrame section="students">
      <div className="space-y-5">
        <ResourceToolbar
          tabs={STUDENT_TABS}
          activeKey={activeTab}
          onTabChange={setActiveTab}
          action={activeTab === 'profiles' ? { label: '新增学员', onClick: openCreate } : null}
          secondaryActions={
            activeTab === 'profiles' || activeTab === 'history'
              ? [
                  {
                    label: exporting ? '导出中...' : '导出 Excel',
                    onClick: () =>
                      exportStudents(
                        activeTab === 'history' ? archivedData : data,
                        activeTab === 'history',
                      ),
                    disabled:
                      exporting ||
                      contractsLoading ||
                      Boolean(contractsError) ||
                      (activeTab === 'history' ? archivedData.length === 0 : data.length === 0),
                    icon: Download,
                  },
                ]
              : []
          }
        />

        {activeTab === 'profiles' ? (
          <DataTable
            columns={[
              {
                key: 'name',
                header: '学员',
                cell: (row) => (
                  <button
                    type="button"
                    className="cell-stack text-left"
                    onClick={() => setSelected(row)}
                  >
                    <span className="cell-title">{row.name}</span>
                    <span className="cell-subtitle">
                      {row.grade}
                      {row.school ? ` · ${row.school}` : ''}
                    </span>
                  </button>
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
                cell: balanceCell,
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
                      onClick={() => setSelected(row)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      详情
                    </button>
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
                      onClick={() => setArchiveTarget(row)}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      移入历史
                    </button>
                  </div>
                ),
              },
            ]}
            data={data}
            emptyMessage="暂无学员档案"
            getRowKey={(row) => row.id}
          />
        ) : activeTab === 'history' ? (
          <DataTable
            columns={[
              {
                key: 'name',
                header: '学员',
                cell: (row) => (
                  <button
                    type="button"
                    className="cell-stack text-left"
                    onClick={() => setSelected(row)}
                  >
                    <span className="cell-title">{row.name}</span>
                    <span className="cell-subtitle">
                      {row.grade}
                      {row.school ? ` · ${row.school}` : ''}
                    </span>
                  </button>
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
                cell: balanceCell,
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
                      onClick={() => setSelected(row)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      详情
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1"
                      disabled={restoringId === row.id}
                      onClick={() => restoreStudent(row)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {restoringId === row.id ? '恢复中' : '恢复'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => setHardDeleteTarget(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                ),
              },
            ]}
            data={archivedData}
            emptyMessage="暂无历史档案"
            getRowKey={(row) => row.id}
          />
        ) : activeTab === 'parentAccounts' ? (
          <ParentAccountsPanel students={[...data, ...archivedData]} />
        ) : activeTab === 'lessonAccounts' ? (
          <LessonAccountsPanel />
        ) : (
          <CourseContractsPanel />
        )}
      </div>

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
        <FieldRow>
          <Field label="家长姓名">
            <input
              className="form-input"
              value={form.guardianName}
              onChange={(event) => setForm({ ...form, guardianName: event.target.value })}
            />
          </Field>
          <Field
            label={
              <span className="flex items-center justify-between gap-3">
                <span>家长手机号</span>
                <label className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={form.createParentAccount}
                    onChange={(event) =>
                      setForm({ ...form, createParentAccount: event.target.checked })
                    }
                  />
                  创建家长账号
                </label>
              </span>
            }
          >
            <input
              className="form-input"
              value={form.guardianPhone}
              onChange={(event) => setForm({ ...form, guardianPhone: event.target.value })}
            />
          </Field>
        </FieldRow>
        {form.createParentAccount ? (
          <p className="text-muted-foreground -mt-2 text-xs">
            创建成功后默认密码为手机号后 6 位，家长首次登录需修改密码。
          </p>
        ) : null}
        <Field label="状态">
          <select
            className="form-input"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as StudentForm['status'] })
            }
          >
            <option value="active">{statusLabel('active')}</option>
            <option value="inactive">{statusLabel('inactive')}</option>
          </select>
        </Field>
      </Drawer>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? selected.name : ''}
        description={
          selected ? `${selected.grade}${selected.school ? ` · ${selected.school}` : ''}` : ''
        }
      >
        {selected && (
          <div className="space-y-4">
            <section className="resource-card p-4">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">学员姓名</span>
                <span>{selected.name}</span>
                <span className="text-muted-foreground">年级 / 年龄</span>
                <span>{selected.grade}</span>
                <span className="text-muted-foreground">学校</span>
                <span>{selected.school ?? '-'}</span>
                <span className="text-muted-foreground">状态</span>
                <span>
                  <StatusPill tone={statusToTone(selected.status)} label={selected.status} />
                </span>
              </div>
            </section>
            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">家长与账号</h3>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">家长</span>
                <span>{selected.guardian?.name ?? '-'}</span>
                <span className="text-muted-foreground">手机号</span>
                <span>{selected.guardian?.phone ?? '-'}</span>
              </div>
            </section>
            <section className="resource-card p-4">
              <h3 className="mb-3 text-sm font-semibold">课时包 / 课时余额</h3>
              {contractsForStudent(selected.id).length ? (
                <div className="space-y-2">
                  {contractsForStudent(selected.id).map((contract) => (
                    <div
                      key={contract.id}
                      className="flex justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="block font-medium">
                          {contract.course?.name ?? contract.courseId}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {contract.package?.name ?? contract.title}
                          {contract.endsAt
                            ? ` · ${new Date(contract.endsAt).toLocaleDateString('zh-CN')} 到期`
                            : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {contract.remainingLessonCount} / {contract.lessonCount} 节
                        <span className="text-muted-foreground block text-xs">
                          已用 {Math.max(contract.lessonCount - contract.remainingLessonCount, 0)}{' '}
                          节
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : selected.lessonAccounts?.length ? (
                <div className="space-y-2">
                  {selected.lessonAccounts.map((account) => (
                    <div
                      key={account.courseId}
                      className="flex justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span>{account.course?.name ?? account.courseId}</span>
                      <span>{account.balance} 节</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">暂无课时账户</p>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="移入历史档案？"
        message={`确认将「${archiveTarget?.name ?? ''}」移入历史档案？该学员不会出现在日常学员列表和家长端孩子档案中，课时、班级、考勤、作业、订单、合同等记录会保留。`}
        confirmLabel="移入历史"
        danger
        busy={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={archiveStudent}
      />
      <ConfirmDialog
        open={Boolean(hardDeleteTarget)}
        title="永久删除学员？"
        message={`确认永久删除「${hardDeleteTarget?.name ?? ''}」及其全部相关数据？此操作不可撤销，包括订单、课程合约、课时账户等所有数据都将被删除。`}
        confirmLabel="永久删除"
        danger
        busy={hardDeleting}
        onCancel={() => setHardDeleteTarget(null)}
        onConfirm={hardDeleteStudent}
      />
    </PageFrame>
  );
}

function ParentAccountsPanel({ students }: { students: Student[] }) {
  const toast = useToast();
  const { data: accounts, setData: setAccounts } = useApiResource<Account>(
    '/v1/accounts',
    'accounts',
  );
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  const parentAccounts = accounts.filter((account) => account.role === 'parent');

  function linkedStudents(account: Account) {
    if (!account.guardianId) return [];
    return students.filter((student) => student.guardianId === account.guardianId);
  }

  async function deleteParentAccount() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { account } = await apiDelete<{ account: Account }>(`/v1/accounts/${deleteTarget.id}`);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setDeleteTarget(null);
      toast.success('家长账号已删除，手机号已释放');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DataTable
        columns={[
          {
            key: 'account',
            header: '家长账号',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.displayName}</span>
                <span className="cell-subtitle">{row.phone ?? row.email ?? '-'}</span>
              </div>
            ),
            sortValue: (row) => row.displayName,
            filterValue: (row) => `${row.displayName} ${row.phone ?? ''} ${row.email ?? ''}`,
          },
          {
            key: 'guardian',
            header: '绑定家长档案',
            cell: (row) =>
              row.guardian ? `${row.guardian.name} · ${row.guardian.phone}` : '未绑定',
            filterValue: (row) => `${row.guardian?.name ?? ''} ${row.guardian?.phone ?? ''}`,
          },
          {
            key: 'students',
            header: '关联学员',
            cell: (row) => {
              const linked = linkedStudents(row);
              return linked.length ? (
                <div className="cell-stack">
                  <span className="cell-title">
                    {linked.map((student) => student.name).join('、')}
                  </span>
                  <span className="cell-subtitle">共 {linked.length} 位学员</span>
                </div>
              ) : (
                '无关联学员'
              );
            },
            filterValue: (row) =>
              linkedStudents(row)
                .map((student) => student.name)
                .join(' '),
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
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
            key: 'createdAt',
            header: '创建时间',
            cell: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
            sortValue: (row) => new Date(row.createdAt),
          },
          {
            key: 'actions',
            header: '操作',
            cell: (row) => (
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-red-600"
                onClick={() => setDeleteTarget(row)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除账号
              </button>
            ),
            sortable: false,
          },
        ]}
        data={parentAccounts}
        emptyMessage="暂无家长账号"
        getRowKey={(row) => row.id}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除家长账号？"
        message={`确认删除「${deleteTarget?.displayName ?? ''}」？删除后该账号不能登录，微信绑定会同步解除，手机号可重新用于创建新家长账号；学员档案和家长档案不会被删除。`}
        confirmLabel="删除账号"
        danger
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteParentAccount}
      />
    </>
  );
}
