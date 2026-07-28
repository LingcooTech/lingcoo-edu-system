import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Course, CoursePackage, CourseSeries } from '@/api/types';
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
  courseSeriesId: string;
  billingType: 'lesson' | 'period';
  periodUnit: 'week' | 'month';
  periodCount: string;
  lessonCount: string;
  giftedLessonCount: string;
  priceYuan: string;
  discountPriceYuan: string;
  status: 'active' | 'archived';
}

const emptyPackageForm: PackageForm = {
  name: '',
  description: '',
  courseId: '',
  courseSeriesId: '',
  billingType: 'lesson',
  periodUnit: 'month',
  periodCount: '1',
  lessonCount: '12',
  giftedLessonCount: '0',
  priceYuan: '0',
  discountPriceYuan: '',
  status: 'active',
};

function effectivePackagePrice(pkg: CoursePackage) {
  return pkg.discountPriceAmount ?? pkg.priceAmount;
}

function effectiveLessonCount(pkg: CoursePackage) {
  return pkg.lessonCount + (pkg.giftedLessonCount ?? 0);
}

function lessonLabel(pkg: CoursePackage) {
  if (pkg.billingType === 'period') {
    const unit = pkg.periodUnit === 'week' ? '周' : '个月';
    return `${pkg.periodCount}${unit}内最多 ${pkg.lessonCount} 节`;
  }
  return pkg.giftedLessonCount
    ? `${pkg.lessonCount} + 赠 ${pkg.giftedLessonCount} 节`
    : `${pkg.lessonCount} 节`;
}

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
  const { data: courseSeries } = useApiResource<CourseSeries>('/v1/course-series', 'courseSeries');
  const courseName = useMemo(
    () => new Map(courses.map((course) => [course.id, course.name])),
    [courses],
  );
  const seriesName = useMemo(
    () => new Map(courseSeries.map((series) => [series.id, series.name])),
    [courseSeries],
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
      courseSeriesId: pkg.courseSeriesId ?? '',
      billingType: pkg.billingType ?? 'lesson',
      periodUnit: pkg.periodUnit === 'week' ? 'week' : 'month',
      periodCount: String(pkg.periodCount ?? 1),
      lessonCount: String(pkg.lessonCount),
      giftedLessonCount: String(pkg.giftedLessonCount ?? 0),
      priceYuan: String(pkg.priceAmount / 100),
      discountPriceYuan:
        pkg.discountPriceAmount === null || pkg.discountPriceAmount === undefined
          ? ''
          : String(pkg.discountPriceAmount / 100),
      status: (pkg.status as PackageForm['status']) ?? 'active',
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error('课时包名称必填');
      return;
    }
    if (!form.courseSeriesId && !form.courseId) {
      toast.error('请选择课时包适用的课程系列或单个课程');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        courseId: form.courseId || null,
        courseSeriesId: form.courseSeriesId || null,
        billingType: form.billingType,
        periodUnit: form.billingType === 'period' ? form.periodUnit : null,
        periodCount: form.billingType === 'period' ? Math.max(1, Number(form.periodCount) || 1) : 1,
        lessonCount: Number(form.lessonCount) || 1,
        giftedLessonCount:
          form.billingType === 'period' ? 0 : Math.max(0, Number(form.giftedLessonCount) || 0),
        priceAmount: Math.round((Number(form.priceYuan) || 0) * 100),
        discountPriceAmount:
          form.discountPriceYuan.trim() === ''
            ? null
            : Math.round((Number(form.discountPriceYuan) || 0) * 100),
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
            header: '适用范围',
            cell: (row) =>
              row.courseId
                ? `课程：${courseName.get(row.courseId) ?? '-'}`
                : row.courseSeriesId
                  ? `系列：${seriesName.get(row.courseSeriesId) ?? '-'}`
                  : '未关联',
          },
          {
            key: 'lessons',
            header: '课时',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{effectiveLessonCount(row)} 节</span>
                <span className="cell-subtitle">{lessonLabel(row)}</span>
              </div>
            ),
          },
          {
            key: 'price',
            header: '价格',
            cell: (row) =>
              row.discountPriceAmount === null || row.discountPriceAmount === undefined ? (
                money(row.priceAmount)
              ) : (
                <div className="cell-stack">
                  <span className="cell-title">{money(effectivePackagePrice(row))}</span>
                  <span className="cell-subtitle line-through">{money(row.priceAmount)}</span>
                </div>
              ),
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
        data={packages}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑课时包' : '新增课时包'}
        description="课时包需绑定课程系列或单个课程；公开端是否购买由业务开关控制。"
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
        <FieldRow>
          <Field label="适用课程系列" hint="同系列课程共享课时包">
            <select
              className="form-input"
              value={form.courseSeriesId}
              onChange={(event) =>
                setForm({ ...form, courseSeriesId: event.target.value, courseId: '' })
              }
            >
              <option value="">选择课程系列</option>
              {courseSeries
                .filter((series) => series.status !== 'archived')
                .map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="适用单个课程" hint="特殊价格课程使用">
            <select
              className="form-input"
              value={form.courseId}
              onChange={(event) =>
                setForm({ ...form, courseId: event.target.value, courseSeriesId: '' })
              }
            >
              <option value="">选择单个课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="计费方式">
            <select
              className="form-input"
              value={form.billingType}
              onChange={(event) =>
                setForm({
                  ...form,
                  billingType: event.target.value as PackageForm['billingType'],
                  giftedLessonCount: event.target.value === 'period' ? '0' : form.giftedLessonCount,
                })
              }
            >
              <option value="lesson">普通课时包</option>
              <option value="period">周期卡</option>
            </select>
          </Field>
          {form.billingType === 'period' ? (
            <Field label="有效周期" hint="每次购买对应一个周期">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  value={form.periodCount}
                  onChange={(event) => setForm({ ...form, periodCount: event.target.value })}
                />
                <select
                  className="form-input"
                  value={form.periodUnit}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      periodUnit: event.target.value as PackageForm['periodUnit'],
                    })
                  }
                >
                  <option value="week">周</option>
                  <option value="month">个月</option>
                </select>
              </div>
            </Field>
          ) : (
            <div />
          )}
        </FieldRow>
        <FieldRow>
          <Field label={form.billingType === 'period' ? '周期内课时上限' : '课时数(节)'}>
            <input
              className="form-input"
              type="number"
              value={form.lessonCount}
              onChange={(e) => setForm({ ...form, lessonCount: e.target.value })}
            />
          </Field>
          <Field label="赠送节数">
            <input
              className="form-input"
              type="number"
              min={0}
              value={form.giftedLessonCount}
              disabled={form.billingType === 'period'}
              onChange={(e) => setForm({ ...form, giftedLessonCount: e.target.value })}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="原价(元)">
            <input
              className="form-input"
              type="number"
              value={form.priceYuan}
              onChange={(e) => setForm({ ...form, priceYuan: e.target.value })}
            />
          </Field>
          <Field label="折扣价(元)" hint="留空则按原价售卖">
            <input
              className="form-input"
              type="number"
              value={form.discountPriceYuan}
              onChange={(e) => setForm({ ...form, discountPriceYuan: e.target.value })}
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
