import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, XCircle, Pencil, Trash2 } from 'lucide-react';

import { apiPatch, apiPost, fetchOrganization } from '@/api/client';
import type {
  ClassGroup,
  Course,
  CourseContract,
  CoursePackage,
  Student,
  OrganizationSettings,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime, money } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '现金',
  bank_transfer: '银行转账',
  wechat_offline: '微信线下',
  alipay_offline: '支付宝线下',
  offline_other: '其他线下',
  wechat_pay: '微信支付',
  mock: '模拟支付',
  online_payment: '线上支付',
};

const PAYMENT_RECEIVER_TYPE_LABEL: Record<string, string> = {
  platform: '平台收款',
  provider: '课程提供方收款',
  other: '其他收款方',
};

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

const GIFT_REASON_LABEL: Record<string, string> = {
  group_signup: '组团报名',
  negotiation: '价格谈判',
  retention: '续费赠课',
  other: '其他',
};

interface GiftForm {
  courseId: string;
  classId: string;
  title: string;
  lessonCount: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  note: string;
}

interface ContractForm {
  studentId: string;
  courseId: string;
  classId: string;
  packageId: string;
  title: string;
  lessonCount: string;
  paidYuan: string;
  paymentMethod: string;
  startsAt: string;
  endsAt: string;
  note: string;
  gifts: GiftForm[];
}

const emptyForm: ContractForm = {
  studentId: '',
  courseId: '',
  classId: '',
  packageId: '',
  title: '',
  lessonCount: '',
  paidYuan: '',
  paymentMethod: 'wechat_offline',
  startsAt: '',
  endsAt: '',
  note: '',
  gifts: [],
};

function toDateTime(value: string) {
  return value ? new Date(`${value}T00:00:00+08:00`).toISOString() : undefined;
}

function contractSearchText(contract: CourseContract) {
  return [
    contract.contractNo,
    contract.title,
    contract.student?.name,
    contract.course?.name,
    contract.class?.name,
    contract.package?.name,
    contract.paymentReceiverName,
    contract.note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function contractStatusTone(status: string) {
  if (status === 'active') return 'ok';
  if (status === 'completed') return 'info';
  if (status === 'cancelled') return 'danger';
  return statusToTone(status);
}

function needsOnlineConfirmation(contract: CourseContract) {
  return (
    contract.status === 'active' &&
    !contract.classId &&
    Boolean(contract.orderId) &&
    contract.note?.includes('线上支付自动生成')
  );
}

function effectivePackagePrice(coursePackage: CoursePackage) {
  return coursePackage.discountPriceAmount ?? coursePackage.priceAmount;
}

function effectivePackageLessonCount(coursePackage: CoursePackage) {
  return coursePackage.lessonCount + (coursePackage.giftedLessonCount ?? 0);
}

function packageLessonLabel(coursePackage: CoursePackage) {
  return coursePackage.giftedLessonCount
    ? `${coursePackage.lessonCount} + 赠 ${coursePackage.giftedLessonCount} 节`
    : `${coursePackage.lessonCount} 节`;
}

function giftSummary(contract: CourseContract) {
  const gifts = contract.gifts ?? [];
  if (gifts.length === 0) return '-';
  return gifts.map((gift) => `${gift.course?.name ?? '赠课'} ${gift.lessonCount} 节`).join('；');
}

export function CourseContractsPage() {
  return <CourseContractsPanel framed />;
}

export function CourseContractsPanel({ framed = false }: { framed?: boolean }) {
  const toast = useToast();
  const { data, setData } = useApiResource<CourseContract>(
    '/v1/course-contracts',
    'courseContracts',
  );
  const { data: students } = useApiResource<Student>('/v1/students', 'students');
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const { data: classes } = useApiResource<ClassGroup>('/v1/classes', 'classes');
  const { data: packages } = useApiResource<CoursePackage>('/v1/course-packages', 'coursePackages');

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ContractForm>(emptyForm);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState<CourseContract | null>(null);
  const [giftForm, setGiftForm] = useState<GiftForm | null>(null);
  const [giftSaving, setGiftSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<{
    businessModel: Pick<OrganizationSettings['businessModel'], 'courseContractEditEnabled'>;
  } | null>(null);

  const activeStudents = useMemo(
    () => students.filter((student) => student.status !== 'inactive'),
    [students],
  );
  const activePackages = useMemo(
    () => packages.filter((coursePackage) => coursePackage.status === 'active'),
    [packages],
  );
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );
  const packageAppliesToCourse = useCallback(
    (coursePackage: CoursePackage, courseId: string) => {
      const course = courseById.get(courseId);
      return (
        coursePackage.courseId === courseId ||
        Boolean(course?.courseSeriesId && coursePackage.courseSeriesId === course.courseSeriesId)
      );
    },
    [courseById],
  );
  const selectedCoursePackages = useMemo(
    () =>
      activePackages.filter((coursePackage) =>
        form.courseId ? packageAppliesToCourse(coursePackage, form.courseId) : true,
      ),
    [activePackages, form.courseId, packageAppliesToCourse],
  );
  const selectedCourseClasses = useMemo(
    () =>
      classes.filter(
        (classGroup) =>
          classGroup.courseId === form.courseId &&
          !['archived', 'completed'].includes(classGroup.status),
      ),
    [classes, form.courseId],
  );
  const selectedPackage = selectedCoursePackages.find((item) => item.id === form.packageId);
  const activeGiftCourses = useMemo(
    () => courses.filter((course) => course.status !== 'archived'),
    [courses],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.filter((contract) => {
      if (statusFilter !== 'all' && contract.status !== statusFilter) return false;
      if (normalizedQuery && !contractSearchText(contract).includes(normalizedQuery)) return false;
      return true;
    });
  }, [data, query, statusFilter]);

  const summary = useMemo(() => {
    const activeContracts = filtered.filter((contract) => contract.status === 'active');
    return {
      activeCount: activeContracts.length,
      lessonCount: activeContracts.reduce((sum, contract) => sum + contract.lessonCount, 0),
      paidAmount: filtered.reduce((sum, contract) => sum + contract.paidAmount, 0),
      completedCount: filtered.filter((contract) => contract.status === 'completed').length,
    };
  }, [filtered]);

  function applyPackage(next: ContractForm, coursePackage?: CoursePackage): ContractForm {
    if (!coursePackage) return next;
    return {
      ...next,
      packageId: coursePackage.id,
      title: next.title || coursePackage.name,
      lessonCount: String(effectivePackageLessonCount(coursePackage)),
      paidYuan: String(effectivePackagePrice(coursePackage) / 100),
    };
  }

  function giftClasses(courseId: string) {
    return classes.filter(
      (classGroup) =>
        classGroup.courseId === courseId && !['archived', 'completed'].includes(classGroup.status),
    );
  }

  function createGiftForm(baseCourseId?: string, startsAt = '', endsAt = ''): GiftForm {
    const courseId = baseCourseId || activeGiftCourses[0]?.id || '';
    const firstClass = giftClasses(courseId)[0];
    return {
      courseId,
      classId: firstClass?.id ?? '',
      title: '',
      lessonCount: '1',
      reason: 'other',
      startsAt,
      endsAt,
      note: '',
    };
  }

  function createEmptyGift(): GiftForm {
    return createGiftForm(form.courseId, form.startsAt, form.endsAt);
  }

  function updateGift(index: number, patch: Partial<GiftForm>) {
    setForm((current) => ({
      ...current,
      gifts: current.gifts.map((gift, giftIndex) =>
        giftIndex === index ? { ...gift, ...patch } : gift,
      ),
    }));
  }

  function handleGiftCourseChange(index: number, courseId: string) {
    const firstClass = giftClasses(courseId)[0];
    updateGift(index, { courseId, classId: firstClass?.id ?? '' });
  }

  function removeGift(index: number) {
    setForm((current) => ({
      ...current,
      gifts: current.gifts.filter((_, giftIndex) => giftIndex !== index),
    }));
  }

  useEffect(() => {
    fetchOrganization()
      .then(setOrganization)
      .catch(() => {
        // 如果加载失败，默认允许编辑
        setOrganization({ businessModel: { courseContractEditEnabled: true } });
      });
  }, []);

  function openCreate() {
    const courseId = courses[0]?.id ?? '';
    const firstPackage = activePackages.find((item) => packageAppliesToCourse(item, courseId));
    const firstClass = classes.find(
      (item) => item.courseId === courseId && !['archived', 'completed'].includes(item.status),
    );
    setForm(
      applyPackage(
        {
          ...emptyForm,
          studentId: activeStudents[0]?.id ?? '',
          courseId,
          classId: firstClass?.id ?? '',
        },
        firstPackage,
      ),
    );
    setOpen(true);
  }

  function handleCourseChange(courseId: string) {
    const firstPackage = activePackages.find((item) => packageAppliesToCourse(item, courseId));
    const firstClass = classes.find(
      (item) => item.courseId === courseId && !['archived', 'completed'].includes(item.status),
    );
    setForm(
      applyPackage(
        {
          ...form,
          courseId,
          classId: firstClass?.id ?? '',
          packageId: '',
          title: '',
          lessonCount: '',
          paidYuan: '',
        },
        firstPackage,
      ),
    );
  }

  async function submit() {
    if (!form.studentId || !form.courseId) {
      toast.error('请选择学员和课程');
      return;
    }
    const lessonCount = Number(form.lessonCount);
    if (!Number.isInteger(lessonCount) || lessonCount <= 0) {
      toast.error('课时数必须大于 0');
      return;
    }
    const gifts = form.gifts.map((gift) => ({
      ...gift,
      lessonCount: Number(gift.lessonCount),
    }));
    if (
      gifts.some(
        (gift) => !gift.courseId || !Number.isInteger(gift.lessonCount) || gift.lessonCount <= 0,
      )
    ) {
      toast.error('请完整填写赠课课程和课时数');
      return;
    }
    setSaving(true);
    try {
      const { courseContract } = await apiPost<{ courseContract: CourseContract }>(
        '/v1/course-contracts',
        {
          studentId: form.studentId,
          courseId: form.courseId,
          classId: form.classId || null,
          packageId: form.packageId || null,
          title: form.title.trim() || null,
          lessonCount,
          paidAmount: Math.round((Number(form.paidYuan) || 0) * 100),
          paymentMethod: form.paymentMethod,
          startsAt: toDateTime(form.startsAt),
          endsAt: toDateTime(form.endsAt),
          note: form.note.trim() || null,
          gifts: gifts.map((gift) => ({
            courseId: gift.courseId,
            classId: gift.classId || null,
            title: gift.title.trim() || null,
            lessonCount: gift.lessonCount,
            reason: gift.reason,
            startsAt: toDateTime(gift.startsAt),
            endsAt: toDateTime(gift.endsAt),
            note: gift.note.trim() || null,
          })),
        },
      );
      setData([courseContract, ...data]);
      toast.success('正式课程档案已创建，课时余额已更新');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(contract: CourseContract) {
    setEditingId(contract.id);
    setForm({
      studentId: contract.student?.name ?? '',
      courseId: contract.course?.name ?? '',
      classId: contract.class?.id ?? '',
      packageId: contract.package?.id ?? '',
      title: contract.title,
      lessonCount: String(contract.lessonCount),
      paidYuan: String(contract.paidAmount / 100),
      paymentMethod: contract.paymentMethod ?? 'wechat_offline',
      startsAt: contract.startsAt ? new Date(contract.startsAt).toISOString().split('T')[0] : '',
      endsAt: contract.endsAt ? new Date(contract.endsAt).toISOString().split('T')[0] : '',
      note: contract.note ?? '',
      gifts: [],
    });
    setOpen(true);
  }

  async function submitEdit() {
    if (!editingId) return;
    const lessonCount = Number(form.lessonCount);
    if (!Number.isInteger(lessonCount) || lessonCount <= 0) {
      toast.error('课时数必须大于 0');
      return;
    }
    setSaving(true);
    try {
      const { courseContract } = await apiPatch<{ courseContract: CourseContract }>(
        `/v1/course-contracts/${editingId}`,
        {
          title: form.title.trim() || null,
          lessonCount,
          paidAmount: Math.round((Number(form.paidYuan) || 0) * 100),
          paymentMethod: form.paymentMethod,
          startsAt: toDateTime(form.startsAt),
          endsAt: toDateTime(form.endsAt),
          note: form.note.trim() || null,
        },
      );
      setData(
        data.map((item) =>
          item.id === editingId
            ? {
                ...item,
                ...courseContract,
              }
            : item,
        ),
      );
      toast.success('正式课程档案已更新');
      setOpen(false);
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSaving(false);
    }
  }

  function openSupplementGift(contract: CourseContract) {
    setGiftTarget(contract);
    setGiftForm(
      createGiftForm(
        contract.courseId,
        contract.startsAt ? new Date(contract.startsAt).toISOString().split('T')[0] : '',
        contract.endsAt ? new Date(contract.endsAt).toISOString().split('T')[0] : '',
      ),
    );
    setGiftOpen(true);
  }

  function updateSupplementGift(patch: Partial<GiftForm>) {
    setGiftForm((current) => (current ? { ...current, ...patch } : current));
  }

  function handleSupplementGiftCourseChange(courseId: string) {
    const firstClass = giftClasses(courseId)[0];
    updateSupplementGift({ courseId, classId: firstClass?.id ?? '' });
  }

  async function submitSupplementGift() {
    if (!giftTarget || !giftForm) return;
    const lessonCount = Number(giftForm.lessonCount);
    if (!giftForm.courseId || !Number.isInteger(lessonCount) || lessonCount <= 0) {
      toast.error('请完整填写赠课课程和课时数');
      return;
    }

    setGiftSaving(true);
    try {
      const { gift } = await apiPost<{ gift: NonNullable<CourseContract['gifts']>[number] }>(
        `/v1/course-contracts/${giftTarget.id}/gifts`,
        {
          courseId: giftForm.courseId,
          classId: giftForm.classId || null,
          title: giftForm.title.trim() || null,
          lessonCount,
          reason: giftForm.reason,
          startsAt: toDateTime(giftForm.startsAt),
          endsAt: toDateTime(giftForm.endsAt),
          note: giftForm.note.trim() || null,
        },
      );
      setData(
        data.map((item) =>
          item.id === giftTarget.id
            ? {
                ...item,
                gifts: [...(item.gifts ?? []), gift],
              }
            : item,
        ),
      );
      toast.success('补赠课已添加，课时余额已更新');
      setGiftOpen(false);
      setGiftTarget(null);
      setGiftForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '补赠课失败');
    } finally {
      setGiftSaving(false);
    }
  }

  async function updateStatus(contract: CourseContract, status: 'completed' | 'cancelled') {
    try {
      const { courseContract } = await apiPatch<{ courseContract: CourseContract }>(
        `/v1/course-contracts/${contract.id}/status`,
        { status },
      );
      setData(
        data.map((item) =>
          item.id === contract.id
            ? {
                ...item,
                ...courseContract,
              }
            : item,
        ),
      );
      toast.success('档案状态已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '状态更新失败');
    }
  }

  const toolbar = (
    <div className="flex flex-wrap justify-end gap-2">
      <select
        className="form-input w-auto py-1.5"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="all">全部状态</option>
        <option value="active">进行中</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已取消</option>
      </select>
      <input
        className="form-input w-56 py-1.5"
        placeholder="搜索档案/学员/课程/收款方"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="button" className="btn btn-primary" onClick={openCreate}>
        <Plus className="h-4 w-4" />
        新增正式课程档案
      </button>
    </div>
  );

  const content = (
    <>
      <div className="metric-grid mb-6">
        <MetricCard label="筛选档案" value={filtered.length} hint={`全部 ${data.length} 份`} />
        <MetricCard label="进行中档案" value={summary.activeCount} hint="可继续消课" />
        <MetricCard label="进行中课时" value={`${summary.lessonCount} 节`} hint="筛选范围内" />
        <MetricCard
          label="线下实收"
          value={money(summary.paidAmount)}
          hint={`${summary.completedCount} 份已完成`}
        />
      </div>

      <DataTable
        columns={[
          {
            key: 'contract',
            header: '档案',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.title}</span>
                <span className="cell-subtitle">{row.contractNo}</span>
              </div>
            ),
          },
          {
            key: 'student',
            header: '学员',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.student?.name ?? '-'}</span>
                <span className="cell-subtitle">{row.student?.grade ?? '-'}</span>
              </div>
            ),
          },
          { key: 'course', header: '课程', cell: (row) => row.course?.name ?? '-' },
          {
            key: 'class',
            header: '班级/课时包',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.class?.name ?? '-'}</span>
                <span className="cell-subtitle">{row.package?.name ?? '自定义课时'}</span>
              </div>
            ),
          },
          { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
          { key: 'gifts', header: '赠课', cell: (row) => giftSummary(row) },
          { key: 'paid', header: '实收', cell: (row) => money(row.paidAmount) },
          {
            key: 'receiver',
            header: '收款方',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.paymentReceiverName ?? '-'}</span>
                <span className="cell-subtitle">
                  {PAYMENT_RECEIVER_TYPE_LABEL[row.paymentReceiverType] ?? row.paymentReceiverType}
                </span>
              </div>
            ),
          },
          {
            key: 'method',
            header: '支付方式',
            cell: (row) =>
              row.paymentMethod
                ? (PAYMENT_METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod)
                : '-',
          },
          {
            key: 'status',
            header: '状态',
            cell: (row) => (
              <StatusPill
                tone={needsOnlineConfirmation(row) ? 'warn' : contractStatusTone(row.status)}
                label={
                  needsOnlineConfirmation(row)
                    ? '待确认'
                    : (CONTRACT_STATUS_LABEL[row.status] ?? row.status)
                }
              />
            ),
          },
          { key: 'created', header: '创建时间', cell: (row) => formatDateTime(row.createdAt) },
          {
            key: 'actions',
            header: '操作',
            cell: (row) => (
              <div className="flex gap-1">
                {organization?.businessModel.courseContractEditEnabled && (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  disabled={row.status !== 'active'}
                  onClick={() => openSupplementGift(row)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  补赠课
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  disabled={row.status !== 'active'}
                  onClick={() => updateStatus(row, 'completed')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  完成
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600"
                  disabled={row.status !== 'active'}
                  onClick={() => updateStatus(row, 'cancelled')}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  取消
                </button>
              </div>
            ),
          },
        ]}
        data={filtered}
        emptyMessage="没有符合筛选条件的正式课程档案。"
      />

      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingId(null);
        }}
        title={editingId ? '编辑正式课程档案' : '新增正式课程档案'}
        description={
          editingId
            ? '修改课程档案信息，更新会实时同步到系统。'
            : '线下确认收款后，创建档案并为学员添加对应课时。'
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setOpen(false);
                setEditingId(null);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={editingId ? submitEdit : submit}
              disabled={saving}
            >
              {saving
                ? editingId
                  ? '更新中...'
                  : '创建中...'
                : editingId
                  ? '更新档案'
                  : '创建档案'}
            </button>
          </>
        }
      >
        <FieldRow>
          <Field label="学员" required>
            <select
              className="form-input"
              value={form.studentId}
              onChange={(event) => setForm({ ...form, studentId: event.target.value })}
              disabled={!!editingId}
            >
              <option value="">选择学员</option>
              {activeStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.grade}
                </option>
              ))}
            </select>
          </Field>
          <Field label="课程" required>
            <select
              className="form-input"
              value={form.courseId}
              onChange={(event) => handleCourseChange(event.target.value)}
              disabled={!!editingId}
            >
              <option value="">选择课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <Field label="课时包">
          <select
            className="form-input"
            value={form.packageId}
            onChange={(event) => {
              const coursePackage = selectedCoursePackages.find(
                (item) => item.id === event.target.value,
              );
              setForm(
                applyPackage(
                  {
                    ...form,
                    packageId: '',
                    title: '',
                  },
                  coursePackage,
                ),
              );
            }}
          >
            <option value="">自定义课时</option>
            {selectedCoursePackages.map((coursePackage) => (
              <option key={coursePackage.id} value={coursePackage.id}>
                {coursePackage.name} · {packageLessonLabel(coursePackage)} ·{' '}
                {money(effectivePackagePrice(coursePackage))}
              </option>
            ))}
          </select>
        </Field>
        {selectedPackage && (
          <div className="text-muted-foreground rounded-lg bg-slate-50 px-3 py-2 text-sm">
            默认添加 {effectivePackageLessonCount(selectedPackage)} 节课时，展示价{' '}
            {money(effectivePackagePrice(selectedPackage))}
            {selectedPackage.discountPriceAmount !== null &&
            selectedPackage.discountPriceAmount !== undefined
              ? `（原价 ${money(selectedPackage.priceAmount)}）`
              : ''}
            ，本次以线下实收为准。
          </div>
        )}
        <Field label="档案标题">
          <input
            className="form-input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="课时数" required>
            <input
              className="form-input"
              type="number"
              value={form.lessonCount}
              onChange={(event) => setForm({ ...form, lessonCount: event.target.value })}
            />
          </Field>
          <Field label="线下实收(元)">
            <input
              className="form-input"
              type="number"
              value={form.paidYuan}
              onChange={(event) => setForm({ ...form, paidYuan: event.target.value })}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="班级">
            <select
              className="form-input"
              value={form.classId}
              onChange={(event) => setForm({ ...form, classId: event.target.value })}
            >
              <option value="">暂不入班</option>
              {selectedCourseClasses.map((classGroup) => (
                <option key={classGroup.id} value={classGroup.id}>
                  {classGroup.name} · {classGroup.enrolledCount}/{classGroup.capacity}
                </option>
              ))}
            </select>
          </Field>
          <Field label="支付方式">
            <select
              className="form-input"
              value={form.paymentMethod}
              onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}
            >
              {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="课程开始日期" hint="学员从这个日期开始计算课时、核销出勤">
            <input
              className="form-input"
              type="date"
              value={form.startsAt}
              onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
            />
          </Field>
          <Field label="课程结束日期">
            <input
              className="form-input"
              type="date"
              value={form.endsAt}
              onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
            />
          </Field>
        </FieldRow>
        {!editingId && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">赠课</div>
                <div className="text-muted-foreground text-xs">
                  赠课会直接进入对应课程的课时账户，可赠送同课程或其他课程。
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary px-3 py-1.5"
                onClick={() => setForm({ ...form, gifts: [...form.gifts, createEmptyGift()] })}
              >
                <Plus className="h-3.5 w-3.5" />
                添加赠课
              </button>
            </div>
            {form.gifts.map((gift, index) => {
              const classesForGift = giftClasses(gift.courseId);
              return (
                <div key={index} className="space-y-3 rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900">赠课 {index + 1}</span>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => removeGift(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                  <FieldRow>
                    <Field label="赠送课程" required>
                      <select
                        className="form-input"
                        value={gift.courseId}
                        onChange={(event) => handleGiftCourseChange(index, event.target.value)}
                      >
                        <option value="">选择课程</option>
                        {activeGiftCourses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="赠送课时" required>
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        value={gift.lessonCount}
                        onChange={(event) => updateGift(index, { lessonCount: event.target.value })}
                      />
                    </Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="赠课班级">
                      <select
                        className="form-input"
                        value={gift.classId}
                        onChange={(event) => updateGift(index, { classId: event.target.value })}
                      >
                        <option value="">暂不入班</option>
                        {classesForGift.map((classGroup) => (
                          <option key={classGroup.id} value={classGroup.id}>
                            {classGroup.name} · {classGroup.enrolledCount}/{classGroup.capacity}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="赠课原因">
                      <select
                        className="form-input"
                        value={gift.reason}
                        onChange={(event) => updateGift(index, { reason: event.target.value })}
                      >
                        {Object.entries(GIFT_REASON_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </FieldRow>
                  <Field label="赠课标题">
                    <input
                      className="form-input"
                      value={gift.title}
                      onChange={(event) => updateGift(index, { title: event.target.value })}
                    />
                  </Field>
                  <FieldRow>
                    <Field label="赠课开始日期">
                      <input
                        className="form-input"
                        type="date"
                        value={gift.startsAt}
                        onChange={(event) => updateGift(index, { startsAt: event.target.value })}
                      />
                    </Field>
                    <Field label="赠课结束日期">
                      <input
                        className="form-input"
                        type="date"
                        value={gift.endsAt}
                        onChange={(event) => updateGift(index, { endsAt: event.target.value })}
                      />
                    </Field>
                  </FieldRow>
                  <Field label="赠课备注">
                    <textarea
                      className="form-input h-16"
                      value={gift.note}
                      onChange={(event) => updateGift(index, { note: event.target.value })}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        )}
        <Field label="备注">
          <textarea
            className="form-input h-20"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </Field>
      </Drawer>

      <Drawer
        open={giftOpen}
        onClose={() => {
          setGiftOpen(false);
          setGiftTarget(null);
          setGiftForm(null);
        }}
        title="补赠课"
        description={
          giftTarget
            ? `为「${giftTarget.student?.name ?? '学员'}」的「${giftTarget.title}」追加赠课。`
            : '为正式课程档案追加赠课。'
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setGiftOpen(false);
                setGiftTarget(null);
                setGiftForm(null);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitSupplementGift}
              disabled={giftSaving || !giftForm}
            >
              {giftSaving ? '添加中...' : '添加补赠课'}
            </button>
          </>
        }
      >
        {giftForm && (
          <div className="space-y-3">
            <div className="text-muted-foreground rounded-lg bg-slate-50 px-3 py-2 text-sm">
              补赠课不会创建新的正式课程档案，会直接进入所选课程的课时账户。
            </div>
            <FieldRow>
              <Field label="赠送课程" required>
                <select
                  className="form-input"
                  value={giftForm.courseId}
                  onChange={(event) => handleSupplementGiftCourseChange(event.target.value)}
                >
                  <option value="">选择课程</option>
                  {activeGiftCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="赠送课时" required>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  value={giftForm.lessonCount}
                  onChange={(event) => updateSupplementGift({ lessonCount: event.target.value })}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="赠课班级">
                <select
                  className="form-input"
                  value={giftForm.classId}
                  onChange={(event) => updateSupplementGift({ classId: event.target.value })}
                >
                  <option value="">暂不入班</option>
                  {giftClasses(giftForm.courseId).map((classGroup) => (
                    <option key={classGroup.id} value={classGroup.id}>
                      {classGroup.name} · {classGroup.enrolledCount}/{classGroup.capacity}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="赠课原因">
                <select
                  className="form-input"
                  value={giftForm.reason}
                  onChange={(event) => updateSupplementGift({ reason: event.target.value })}
                >
                  {Object.entries(GIFT_REASON_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldRow>
            <Field label="赠课标题">
              <input
                className="form-input"
                value={giftForm.title}
                onChange={(event) => updateSupplementGift({ title: event.target.value })}
              />
            </Field>
            <FieldRow>
              <Field label="赠课开始日期">
                <input
                  className="form-input"
                  type="date"
                  value={giftForm.startsAt}
                  onChange={(event) => updateSupplementGift({ startsAt: event.target.value })}
                />
              </Field>
              <Field label="赠课结束日期">
                <input
                  className="form-input"
                  type="date"
                  value={giftForm.endsAt}
                  onChange={(event) => updateSupplementGift({ endsAt: event.target.value })}
                />
              </Field>
            </FieldRow>
            <Field label="赠课备注">
              <textarea
                className="form-input h-20"
                value={giftForm.note}
                onChange={(event) => updateSupplementGift({ note: event.target.value })}
              />
            </Field>
          </div>
        )}
      </Drawer>
    </>
  );

  if (!framed) {
    return (
      <div className="space-y-5">
        <div className="flex justify-end">{toolbar}</div>
        {content}
      </div>
    );
  }

  return (
    <PageFrame section="contracts" actions={toolbar}>
      {content}
    </PageFrame>
  );
}
