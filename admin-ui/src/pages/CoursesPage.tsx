import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Campus, Classroom, Course, CourseSeries, Institution, Teacher } from '@/api/types';
import { parseBlocks, type Block } from '@/components/editor/blocks';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const COURSE_BASE = () => '/v1/courses';

interface CourseForm {
  courseSeriesId: string;
  slug: string;
  name: string;
  category: string;
  ageRange: string;
  durationMinutes: string;
  providerInstitutionId: string;
  defaultTeacherIds: string[];
  classroomIds: string[];
  paymentReceiverInstitutionId: string;
  trialDescription: string;
  coverImageUrl: string;
  onlineSalesEnabled: boolean;
  summary: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
}

const emptyCourseForm: CourseForm = {
  courseSeriesId: '',
  slug: '',
  name: '',
  category: '',
  ageRange: '',
  durationMinutes: '60',
  providerInstitutionId: '',
  defaultTeacherIds: [],
  classroomIds: [],
  paymentReceiverInstitutionId: '',
  trialDescription: '',
  coverImageUrl: '',
  onlineSalesEnabled: true,
  summary: '',
  content: '',
  status: 'draft',
};

function blockToText(block: Block): string {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return block.text;
    case 'list':
      return block.items.map((item) => `- ${item}`).join('\n');
    case 'image':
      return [block.alt, block.caption, block.url].filter(Boolean).join('\n');
    case 'imageText':
      return [block.title, block.text, block.url].filter(Boolean).join('\n');
    case 'stats':
    case 'testimonials':
      return block.items.join('\n');
    case 'cta':
      return [block.text, block.link].filter(Boolean).join('\n');
    case 'gallery':
      return block.urls.join('\n');
    case 'faq':
      return block.items.map((item) => [item.q, item.a].filter(Boolean).join('\n')).join('\n\n');
    case 'divider':
      return '';
  }
}

function contentToEditableText(content?: string) {
  if (!content) return '';
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return content;
  }

  const blocks = parseBlocks(content);
  if (blocks.length === 0) return content;
  return blocks.map(blockToText).filter(Boolean).join('\n\n');
}

function mergeTrialNotice(trialDescription?: string, reservationNotice?: string) {
  const parts = [trialDescription, reservationNotice]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(parts)).join('\n\n');
}

function courseToForm(course: Course): CourseForm {
  const defaultTeacherIds =
    course.defaultTeacherIds && course.defaultTeacherIds.length > 0
      ? course.defaultTeacherIds
      : course.defaultTeacherId
        ? [course.defaultTeacherId]
        : [];
  const classroomIds =
    course.classroomIds && course.classroomIds.length > 0
      ? course.classroomIds
      : course.classroomId
        ? [course.classroomId]
        : [];

  return {
    courseSeriesId: course.courseSeriesId ?? '',
    slug: course.slug,
    name: course.name,
    category: course.category,
    ageRange: course.ageRange,
    durationMinutes: String(course.durationMinutes),
    providerInstitutionId: course.providerInstitutionId ?? '',
    defaultTeacherIds,
    classroomIds,
    paymentReceiverInstitutionId:
      course.paymentReceiverInstitutionId ??
      (course.paymentReceiverType === 'provider' ? (course.providerInstitutionId ?? '') : ''),
    trialDescription: mergeTrialNotice(course.trialDescription, course.reservationNotice),
    coverImageUrl: course.coverImageUrl ?? '',
    onlineSalesEnabled: course.onlineSalesEnabled ?? true,
    summary: course.summary ?? '',
    content: contentToEditableText(course.content),
    status: (course.status as CourseForm['status']) ?? 'draft',
  };
}

function teacherLabel(teacher: Teacher, institutionName: Map<string, string>) {
  return `${teacher.name}${
    teacher.institutionId ? ` · ${institutionName.get(teacher.institutionId) ?? ''}` : ''
  }`;
}

function courseFormToPayload(
  form: CourseForm,
  options: {
    classrooms: Classroom[];
    campusName: Map<string, string>;
    institutions: Institution[];
  },
) {
  const selectedClassrooms = form.classroomIds
    .map((id) => options.classrooms.find((item) => item.id === id))
    .filter((item): item is Classroom => Boolean(item));
  const locationLabel = selectedClassrooms.length
    ? selectedClassrooms
        .map((classroom) =>
          [classroom.name, options.campusName.get(classroom.campusId)].filter(Boolean).join(' · '),
        )
        .filter(Boolean)
        .join(' / ')
    : null;
  const paymentReceiverInstitution =
    options.institutions.find((item) => item.id === form.paymentReceiverInstitutionId) ?? null;
  const paymentReceiverType: Course['paymentReceiverType'] = paymentReceiverInstitution
    ? paymentReceiverInstitution.id === form.providerInstitutionId
      ? 'provider'
      : 'other'
    : 'platform';
  const defaultTeacherIds = Array.from(new Set(form.defaultTeacherIds.filter(Boolean)));

  return {
    slug: form.slug.trim(),
    courseSeriesId: form.courseSeriesId || null,
    name: form.name.trim(),
    category: form.category.trim(),
    ageRange: form.ageRange.trim(),
    durationMinutes: Number(form.durationMinutes) || 60,
    providerInstitutionId: form.providerInstitutionId || null,
    defaultTeacherId: defaultTeacherIds[0] ?? null,
    defaultTeacherIds,
    classroomId: selectedClassrooms[0]?.id ?? null,
    classroomIds: selectedClassrooms.map((classroom) => classroom.id),
    campusId: selectedClassrooms[0]?.campusId ?? null,
    teachingLocationLabel: locationLabel,
    paymentReceiverType,
    paymentReceiverInstitutionId: form.paymentReceiverInstitutionId || null,
    paymentReceiverName: paymentReceiverInstitution?.name ?? null,
    trialDescription: form.trialDescription,
    reservationNotice: '',
    coverImageUrl: form.coverImageUrl.trim() || null,
    onlineSalesEnabled: form.onlineSalesEnabled,
    summary: form.summary,
    content: form.content,
    status: form.status,
  };
}

interface EmbeddedCreateAction {
  label: string;
  onClick: () => void;
}

export function CoursesPage({
  embedded = false,
  onCreateActionChange,
}: {
  embedded?: boolean;
  onCreateActionChange?: (action: EmbeddedCreateAction | null) => void;
} = {}) {
  const toast = useToast();
  const { data: courses, setData: setCourses } = useApiResource<Course>(COURSE_BASE(), 'courses');
  const { data: courseSeries } = useApiResource<CourseSeries>('/v1/course-series', 'courseSeries');
  const { data: institutions } = useApiResource<Institution>('/v1/institutions', 'institutions');
  const { data: teachers } = useApiResource<Teacher>('/v1/teachers', 'teachers');
  const { data: classrooms } = useApiResource<Classroom>('/v1/classrooms', 'classrooms');
  const { data: campuses } = useApiResource<Campus>('/v1/campuses', 'campuses');
  const institutionName = useMemo(
    () => new Map(institutions.map((institution) => [institution.id, institution.name])),
    [institutions],
  );
  const campusName = useMemo(
    () => new Map(campuses.map((campus) => [campus.id, campus.name])),
    [campuses],
  );

  const [editing, setEditing] = useState<Course | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CourseForm>(emptyCourseForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(emptyCourseForm);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!embedded) return;
    onCreateActionChange?.({ label: '新增课程', onClick: openCreate });
    return () => onCreateActionChange?.(null);
  }, [embedded, onCreateActionChange, openCreate]);

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
      const payload = courseFormToPayload(form, { classrooms, campusName, institutions });
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
      const { course } = await apiDelete<{ course: Course }>(`${COURSE_BASE()}/${deleteTarget.id}`);
      setCourses(courses.map((item) => (item.id === course.id ? course : item)));
      toast.success('课程已归档并从前台下架');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  const content = (
    <>
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
                  归档
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
        description="维护课程展示、课程提供方、授课与收款信息；是否允许线上售卖由业务开关和课程开关共同决定。"
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
          <Field label="课程系列">
            <select
              className="form-input"
              value={form.courseSeriesId}
              onChange={(event) => setForm({ ...form, courseSeriesId: event.target.value })}
            >
              <option value="">不归属课程系列</option>
              {courseSeries
                .filter((series) => series.status !== 'archived')
                .map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="单节时长(分钟)">
            <input
              className="form-input"
              type="number"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </Field>
          <Field label="收款方">
            <select
              className="form-input"
              value={form.paymentReceiverInstitutionId}
              onChange={(event) =>
                setForm({ ...form, paymentReceiverInstitutionId: event.target.value })
              }
            >
              <option value="">平台收款</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
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
              onChange={(event) => {
                const providerInstitutionId = event.target.value;
                setForm({
                  ...form,
                  providerInstitutionId,
                  paymentReceiverInstitutionId:
                    form.paymentReceiverInstitutionId === form.providerInstitutionId
                      ? providerInstitutionId
                      : form.paymentReceiverInstitutionId,
                });
              }}
            >
              <option value="">平台自有 / 待填写</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
                </option>
              ))}
            </select>
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
        <div className="mb-3.5 block">
          <span className="form-label">授课教室</span>
          <div className="border-border/80 bg-background grid max-h-44 gap-2 overflow-y-auto rounded-lg border p-2">
            {classrooms.length > 0 ? (
              classrooms.map((classroom) => {
                const checked = form.classroomIds.includes(classroom.id);
                const label = [classroom.name, campusName.get(classroom.campusId)]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <label
                    key={classroom.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-primary/45 bg-primary/5 text-foreground'
                        : 'border-border/70 hover:bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setForm({
                          ...form,
                          classroomIds: event.target.checked
                            ? [...form.classroomIds, classroom.id]
                            : form.classroomIds.filter((id) => id !== classroom.id),
                        });
                      }}
                    />
                  </label>
                );
              })
            ) : (
              <div className="text-muted-foreground px-3 py-2 text-sm">暂无可选教室</div>
            )}
          </div>
        </div>
        <div className="mb-3.5 block">
          <span className="form-label">授课老师</span>
          <div className="border-border/80 bg-background grid max-h-44 gap-2 overflow-y-auto rounded-lg border p-2">
            {teachers.length > 0 ? (
              teachers.map((teacher) => {
                const checked = form.defaultTeacherIds.includes(teacher.id);
                return (
                  <label
                    key={teacher.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-primary/45 bg-primary/5 text-foreground'
                        : 'border-border/70 hover:bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    <span>{teacherLabel(teacher, institutionName)}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setForm({
                          ...form,
                          defaultTeacherIds: event.target.checked
                            ? [...form.defaultTeacherIds, teacher.id]
                            : form.defaultTeacherIds.filter((id) => id !== teacher.id),
                        });
                      }}
                    />
                  </label>
                );
              })
            ) : (
              <div className="text-muted-foreground px-3 py-2 text-sm">暂无可选老师</div>
            )}
          </div>
        </div>
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
        <QiniuImageField
          label="课程封面"
          hint="展示在首页课程卡片和课程详情页"
          value={form.coverImageUrl}
          onChange={(coverImageUrl) => setForm({ ...form, coverImageUrl })}
          prefix="courses/cover"
        />
        <Field label="试听预约说明">
          <textarea
            className="form-input h-28"
            value={form.trialDescription}
            onChange={(event) => setForm({ ...form, trialDescription: event.target.value })}
          />
        </Field>
        <div className="mb-3.5 block">
          <span className="form-label">详情正文</span>
          <RichTextEditor
            value={form.content}
            onChange={(content) => setForm({ ...form, content })}
            prefix="courses/content"
          />
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="归档课程？"
        message={`确认归档「${deleteTarget?.name ?? ''}」？课程会从前台下架，历史班级、订单和课时包记录会保留。`}
        confirmLabel="归档"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <PageFrame
      section="courses"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增课程
        </button>
      }
    >
      {content}
    </PageFrame>
  );
}
