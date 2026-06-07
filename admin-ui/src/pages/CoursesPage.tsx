import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Course, Institution, Teacher } from '@/api/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { COURSE_ALLOWED, parseBlocks, serializeBlocks, type Block } from '@/components/editor/blocks';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const COURSE_BASE = () => '/v1/courses';

interface CourseForm {
  slug: string;
  name: string;
  category: string;
  ageRange: string;
  durationMinutes: string;
  providerInstitutionId: string;
  defaultTeacherId: string;
  teachingLocationLabel: string;
  paymentReceiverType: 'platform' | 'provider' | 'other';
  paymentReceiverInstitutionId: string;
  paymentReceiverName: string;
  trialDescription: string;
  reservationNotice: string;
  onlineSalesEnabled: boolean;
  summary: string;
  contentBlocks: Block[];
  status: 'draft' | 'published' | 'archived';
}

const emptyCourseForm: CourseForm = {
  slug: '',
  name: '',
  category: '',
  ageRange: '',
  durationMinutes: '60',
  providerInstitutionId: '',
  defaultTeacherId: '',
  teachingLocationLabel: '',
  paymentReceiverType: 'platform',
  paymentReceiverInstitutionId: '',
  paymentReceiverName: '',
  trialDescription: '',
  reservationNotice: '',
  onlineSalesEnabled: true,
  summary: '',
  contentBlocks: [],
  status: 'draft',
};

function courseToForm(course: Course): CourseForm {
  return {
    slug: course.slug,
    name: course.name,
    category: course.category,
    ageRange: course.ageRange,
    durationMinutes: String(course.durationMinutes),
    providerInstitutionId: course.providerInstitutionId ?? '',
    defaultTeacherId: course.defaultTeacherId ?? '',
    teachingLocationLabel: course.teachingLocationLabel ?? '',
    paymentReceiverType: course.paymentReceiverType ?? 'platform',
    paymentReceiverInstitutionId: course.paymentReceiverInstitutionId ?? '',
    paymentReceiverName: course.paymentReceiverName ?? '',
    trialDescription: course.trialDescription ?? '',
    reservationNotice: course.reservationNotice ?? '',
    onlineSalesEnabled: course.onlineSalesEnabled ?? true,
    summary: course.summary ?? '',
    contentBlocks: parseBlocks(course.content),
    status: (course.status as CourseForm['status']) ?? 'draft',
  };
}

function courseFormToPayload(form: CourseForm) {
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    category: form.category.trim(),
    ageRange: form.ageRange.trim(),
    durationMinutes: Number(form.durationMinutes) || 60,
    providerInstitutionId: form.providerInstitutionId || null,
    defaultTeacherId: form.defaultTeacherId || null,
    teachingLocationLabel: form.teachingLocationLabel.trim() || null,
    paymentReceiverType: form.paymentReceiverType,
    paymentReceiverInstitutionId: form.paymentReceiverInstitutionId || null,
    paymentReceiverName: form.paymentReceiverName.trim() || null,
    trialDescription: form.trialDescription,
    reservationNotice: form.reservationNotice,
    onlineSalesEnabled: form.onlineSalesEnabled,
    summary: form.summary,
    content: serializeBlocks(form.contentBlocks),
    status: form.status,
  };
}

export function CoursesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const toast = useToast();
  const { data: courses, setData: setCourses } = useApiResource<Course>(COURSE_BASE(), 'courses');
  const { data: institutions } = useApiResource<Institution>('/v1/institutions', 'institutions');
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const institutionName = useMemo(
    () => new Map(institutions.map((institution) => [institution.id, institution.name])),
    [institutions],
  );

  const [editing, setEditing] = useState<Course | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CourseForm>(emptyCourseForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyCourseForm);
    setOpen(true);
  }

  function openEdit(course: Course) {
    setEditing(course);
    setForm(courseToForm(course));
    setOpen(true);
  }

  async function submit() {
    if (!form.slug.trim() || !form.name.trim()) {
      toast.error('课程标识(slug)和名称必填');
      return;
    }
    setSaving(true);
    try {
      const payload = courseFormToPayload(form);
      if (editing) {
        const { course } = await apiPatch<{ course: Course }>(
          `${COURSE_BASE()}/${editing.id}`,
          payload,
        );
        setCourses(courses.map((item) => (item.id === course.id ? course : item)));
        toast.success('课程已更新');
      } else {
        const { course } = await apiPost<{ course: Course }>(COURSE_BASE(), payload);
        setCourses([course, ...courses]);
        toast.success('课程已创建');
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { course } = await apiDelete<{ course: Course }>(
        `${COURSE_BASE()}/${deleteTarget.id}`,
      );
      setCourses(courses.filter((item) => item.id !== course.id));
      toast.success('课程已删除');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  const page = (
    <PageFrame
      section="courses"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增课程
        </button>
      }
    >
      <DataTable
        columns={[
          {
            key: 'name',
            header: '课程',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">
                  {row.slug} · {row.summary}
                </span>
              </div>
            ),
          },
          { key: 'category', header: '分类', cell: (row) => row.category },
          { key: 'age', header: '适龄', cell: (row) => row.ageRange },
          {
            key: 'provider',
            header: '提供方',
            cell: (row) =>
              row.providerInstitutionId
                ? (institutionName.get(row.providerInstitutionId) ?? '-')
                : '-',
          },
          { key: 'duration', header: '单节时长', cell: (row) => `${row.durationMinutes} 分钟` },
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
        data={courses}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑课程' : '新增课程'}
        description="维护课程展示、课程提供方、授课与收款信息；是否允许线上售卖由业务模式和课程开关共同决定。"
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
        <Field label="课程标识 slug" required hint="家长端 URL 用，如 calligraphy-basic">
          <input
            className="form-input"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </Field>
        <Field label="课程名称" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="分类" required>
            <input
              className="form-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </Field>
          <Field label="适龄" required>
            <input
              className="form-input"
              value={form.ageRange}
              onChange={(e) => setForm({ ...form, ageRange: e.target.value })}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="单节时长(分钟)">
            <input
              className="form-input"
              type="number"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </Field>
          <Field label="状态">
            <select
              className="form-input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CourseForm['status'] })}
            >
              {(['draft', 'published', 'archived'] as const).map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="课程提供方">
            <select
              className="form-input"
              value={form.providerInstitutionId}
              onChange={(event) =>
                setForm({ ...form, providerInstitutionId: event.target.value })
              }
            >
              <option value="">平台自有 / 待填写</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="默认授课老师">
            <select
              className="form-input"
              value={form.defaultTeacherId}
              onChange={(event) => setForm({ ...form, defaultTeacherId: event.target.value })}
            >
              <option value="">待场次确认</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                  {teacher.institutionId
                    ? ` · ${institutionName.get(teacher.institutionId) ?? ''}`
                    : ''}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <Field label="授课地点展示">
          <input
            className="form-input"
            placeholder="例如：美智成长教室"
            value={form.teachingLocationLabel}
            onChange={(event) => setForm({ ...form, teachingLocationLabel: event.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="收款方类型">
            <select
              className="form-input"
              value={form.paymentReceiverType}
              onChange={(event) =>
                setForm({
                  ...form,
                  paymentReceiverType: event.target.value as CourseForm['paymentReceiverType'],
                })
              }
            >
              <option value="platform">平台收款</option>
              <option value="provider">课程提供方收款</option>
              <option value="other">其他收款方</option>
            </select>
          </Field>
          <Field label="收款方机构">
            <select
              className="form-input"
              value={form.paymentReceiverInstitutionId}
              onChange={(event) =>
                setForm({ ...form, paymentReceiverInstitutionId: event.target.value })
              }
            >
              <option value="">不关联</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <Field label="收款方展示名" hint="留空时使用平台品牌名或所选机构名">
          <input
            className="form-input"
            value={form.paymentReceiverName}
            onChange={(event) => setForm({ ...form, paymentReceiverName: event.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.onlineSalesEnabled}
            onChange={(event) => setForm({ ...form, onlineSalesEnabled: event.target.checked })}
          />
          允许该课程在线购买课时包
        </label>
        <Field label="一句话简介" hint="展示在课程卡片">
          <textarea
            className="form-input h-16"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </Field>
        <Field label="试听说明">
          <textarea
            className="form-input h-20"
            value={form.trialDescription}
            onChange={(event) => setForm({ ...form, trialDescription: event.target.value })}
          />
        </Field>
        <Field label="预约/取消规则">
          <textarea
            className="form-input h-20"
            value={form.reservationNotice}
            onChange={(event) => setForm({ ...form, reservationNotice: event.target.value })}
          />
        </Field>
        <Field label="详情正文" hint="展示在课程详情页，可用模块编排">
          <BlockEditor
            value={form.contentBlocks}
            onChange={(contentBlocks) => setForm({ ...form, contentBlocks })}
            allowed={COURSE_ALLOWED}
          />
        </Field>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除课程？"
        message={`确认删除「${deleteTarget?.name ?? ''}」？如果课程已被班级、订单或课时包引用，系统会阻止删除。`}
        confirmLabel="删除"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageFrame>
  );

  return embedded ? (
    <div className="[&_.page-header>div]:hidden [&_.page-header]:mb-3 [&_.page-header]:justify-end [&_.page-header]:border-b-0 [&_.page-header]:pb-0 [&_.page-shell]:p-0">
      {page}
    </div>
  ) : (
    page
  );
}
