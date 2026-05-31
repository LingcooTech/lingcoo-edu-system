import { useState } from 'react';
import { Archive, Pencil, Plus } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Course } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const COURSE_BASE = () => '/v1/courses';

interface CourseForm {
  slug: string;
  name: string;
  category: string;
  ageRange: string;
  durationMinutes: string;
  summary: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
}

const emptyCourseForm: CourseForm = {
  slug: '',
  name: '',
  category: '',
  ageRange: '',
  durationMinutes: '60',
  summary: '',
  content: '',
  status: 'draft',
};

function courseToForm(course: Course): CourseForm {
  return {
    slug: course.slug,
    name: course.name,
    category: course.category,
    ageRange: course.ageRange,
    durationMinutes: String(course.durationMinutes),
    summary: course.summary ?? '',
    content: course.content ?? '',
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
    summary: form.summary,
    content: form.content,
    status: form.status,
  };
}

export function CoursesPage() {
  const toast = useToast();
  const { data: courses, setData: setCourses } = useApiResource<Course>(COURSE_BASE(), 'courses');

  const [editing, setEditing] = useState<Course | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CourseForm>(emptyCourseForm);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Course | null>(null);
  const [archiving, setArchiving] = useState(false);

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

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const { course } = await apiDelete<{ course: Course }>(`${COURSE_BASE()}/${archiveTarget.id}`);
      setCourses(courses.map((item) => (item.id === course.id ? course : item)));
      toast.success('课程已归档');
      setArchiveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    } finally {
      setArchiving(false);
    }
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
                {row.status !== 'archived' && (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-red-600"
                    onClick={() => setArchiveTarget(row)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    归档
                  </button>
                )}
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
        description="维护课程产品信息，发布后展示在家长端。课程通过课时包售卖。"
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
              <option value="draft">draft 草稿</option>
              <option value="published">published 已上架</option>
              <option value="archived">archived 已归档</option>
            </select>
          </Field>
        </FieldRow>
        <Field label="一句话简介" hint="展示在课程卡片">
          <textarea
            className="form-input h-16"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </Field>
        <Field label="详情正文" hint="展示在课程详情页">
          <textarea
            className="form-input h-32"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </Field>
      </Drawer>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="归档课程？"
        message={`「${archiveTarget?.name ?? ''}」归档后将从家长端下架，但不影响已有订单和班级。`}
        confirmLabel="归档"
        danger
        busy={archiving}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </PageFrame>
  );
}
