import { useState } from 'react';
import { Archive, Pencil, Plus } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Course, CoursePackage } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';
import { money } from '@/lib/utils';

const COURSE_BASE = () => '/v1/courses';
const PKG_BASE = () => '/v1/course-packages';

interface CourseForm {
  slug: string;
  name: string;
  category: string;
  ageRange: string;
  lessonCount: string;
  durationMinutes: string;
  priceYuan: string;
  summary: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
}

const emptyCourseForm: CourseForm = {
  slug: '',
  name: '',
  category: '',
  ageRange: '',
  lessonCount: '12',
  durationMinutes: '60',
  priceYuan: '0',
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
    lessonCount: String(course.lessonCount),
    durationMinutes: String(course.durationMinutes),
    priceYuan: String(course.priceAmount / 100),
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
    lessonCount: Number(form.lessonCount) || 0,
    durationMinutes: Number(form.durationMinutes) || 60,
    priceAmount: Math.round((Number(form.priceYuan) || 0) * 100),
    summary: form.summary,
    content: form.content,
    status: form.status,
  };
}

interface PackageForm {
  name: string;
  description: string;
  courseId: string;
  lessonCount: string;
  priceYuan: string;
  status: 'active' | 'archived';
}

const emptyPackageForm: PackageForm = {
  name: '',
  description: '',
  courseId: '',
  lessonCount: '12',
  priceYuan: '0',
  status: 'active',
};

export function CoursesPage() {
  const toast = useToast();
  const { data: courses, setData: setCourses } = useApiResource<Course>(COURSE_BASE(), 'courses');
  const { data: packages, setData: setPackages } = useApiResource<CoursePackage>(
    PKG_BASE(),
    'coursePackages',
  );

  // Course editor
  const [courseEditing, setCourseEditing] = useState<Course | null>(null);
  const [courseOpen, setCourseOpen] = useState(false);
  const [courseForm, setCourseForm] = useState<CourseForm>(emptyCourseForm);
  const [savingCourse, setSavingCourse] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Course | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Package editor
  const [pkgEditing, setPkgEditing] = useState<CoursePackage | null>(null);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkgForm, setPkgForm] = useState<PackageForm>(emptyPackageForm);
  const [savingPkg, setSavingPkg] = useState(false);

  function openCreateCourse() {
    setCourseEditing(null);
    setCourseForm(emptyCourseForm);
    setCourseOpen(true);
  }

  function openEditCourse(course: Course) {
    setCourseEditing(course);
    setCourseForm(courseToForm(course));
    setCourseOpen(true);
  }

  async function submitCourse() {
    if (!courseForm.slug.trim() || !courseForm.name.trim()) {
      toast.error('课程标识(slug)和名称必填');
      return;
    }
    setSavingCourse(true);
    try {
      const payload = courseFormToPayload(courseForm);
      if (courseEditing) {
        const { course } = await apiPatch<{ course: Course }>(
          `${COURSE_BASE()}/${courseEditing.id}`,
          payload,
        );
        setCourses(courses.map((item) => (item.id === course.id ? course : item)));
        toast.success('课程已更新');
      } else {
        const { course } = await apiPost<{ course: Course }>(COURSE_BASE(), payload);
        setCourses([course, ...courses]);
        toast.success('课程已创建');
      }
      setCourseOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingCourse(false);
    }
  }

  async function confirmArchiveCourse() {
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

  function openCreatePkg() {
    setPkgEditing(null);
    setPkgForm(emptyPackageForm);
    setPkgOpen(true);
  }

  function openEditPkg(pkg: CoursePackage) {
    setPkgEditing(pkg);
    setPkgForm({
      name: pkg.name,
      description: pkg.description ?? '',
      courseId: pkg.courseId ?? '',
      lessonCount: String(pkg.lessonCount),
      priceYuan: String(pkg.priceAmount / 100),
      status: (pkg.status as PackageForm['status']) ?? 'active',
    });
    setPkgOpen(true);
  }

  async function submitPkg() {
    if (!pkgForm.name.trim()) {
      toast.error('课时包名称必填');
      return;
    }
    setSavingPkg(true);
    try {
      const payload = {
        name: pkgForm.name.trim(),
        description: pkgForm.description,
        courseId: pkgForm.courseId || undefined,
        lessonCount: Number(pkgForm.lessonCount) || 1,
        priceAmount: Math.round((Number(pkgForm.priceYuan) || 0) * 100),
        status: pkgForm.status,
      };
      if (pkgEditing) {
        const { coursePackage } = await apiPatch<{ coursePackage: CoursePackage }>(
          `${PKG_BASE()}/${pkgEditing.id}`,
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
      setPkgOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingPkg(false);
    }
  }

  async function archivePkg(pkg: CoursePackage) {
    try {
      const { coursePackage } = await apiPatch<{ coursePackage: CoursePackage }>(
        `${PKG_BASE()}/${pkg.id}`,
        { status: 'archived' },
      );
      setPackages(packages.map((item) => (item.id === coursePackage.id ? coursePackage : item)));
      toast.success('课时包已归档');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '归档失败');
    }
  }

  return (
    <PageFrame
      section="courses"
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreateCourse}>
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
          { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
          { key: 'price', header: '价格', cell: (row) => money(row.priceAmount) },
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
                  onClick={() => openEditCourse(row)}
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

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">课时包</h2>
          <button type="button" className="btn btn-secondary" onClick={openCreatePkg}>
            <Plus className="h-4 w-4" />
            新增课时包
          </button>
        </div>
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
            { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
            { key: 'price', header: '价格', cell: (row) => money(row.priceAmount) },
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
                    onClick={() => openEditPkg(row)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </button>
                  {row.status !== 'archived' && (
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => archivePkg(row)}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      归档
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          data={packages}
        />
      </div>

      {/* Course editor */}
      <Drawer
        open={courseOpen}
        onClose={() => setCourseOpen(false)}
        title={courseEditing ? '编辑课程' : '新增课程'}
        description="维护课程产品信息，发布后展示在家长端。"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCourseOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitCourse}
              disabled={savingCourse}
            >
              {savingCourse ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <Field label="课程标识 slug" required hint="家长端 URL 用，如 calligraphy-basic">
          <input
            className="form-input"
            value={courseForm.slug}
            onChange={(e) => setCourseForm({ ...courseForm, slug: e.target.value })}
          />
        </Field>
        <Field label="课程名称" required>
          <input
            className="form-input"
            value={courseForm.name}
            onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="分类" required>
            <input
              className="form-input"
              value={courseForm.category}
              onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
            />
          </Field>
          <Field label="适龄" required>
            <input
              className="form-input"
              value={courseForm.ageRange}
              onChange={(e) => setCourseForm({ ...courseForm, ageRange: e.target.value })}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="课时数(节)">
            <input
              className="form-input"
              type="number"
              value={courseForm.lessonCount}
              onChange={(e) => setCourseForm({ ...courseForm, lessonCount: e.target.value })}
            />
          </Field>
          <Field label="单节时长(分钟)">
            <input
              className="form-input"
              type="number"
              value={courseForm.durationMinutes}
              onChange={(e) => setCourseForm({ ...courseForm, durationMinutes: e.target.value })}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="价格(元)">
            <input
              className="form-input"
              type="number"
              value={courseForm.priceYuan}
              onChange={(e) => setCourseForm({ ...courseForm, priceYuan: e.target.value })}
            />
          </Field>
          <Field label="状态">
            <select
              className="form-input"
              value={courseForm.status}
              onChange={(e) =>
                setCourseForm({ ...courseForm, status: e.target.value as CourseForm['status'] })
              }
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
            value={courseForm.summary}
            onChange={(e) => setCourseForm({ ...courseForm, summary: e.target.value })}
          />
        </Field>
        <Field label="详情正文" hint="展示在课程详情页">
          <textarea
            className="form-input h-32"
            value={courseForm.content}
            onChange={(e) => setCourseForm({ ...courseForm, content: e.target.value })}
          />
        </Field>
      </Drawer>

      {/* Package editor */}
      <Drawer
        open={pkgOpen}
        onClose={() => setPkgOpen(false)}
        title={pkgEditing ? '编辑课时包' : '新增课时包'}
        description="课时包是家长端购买的产品。"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPkgOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitPkg}
              disabled={savingPkg}
            >
              {savingPkg ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <Field label="名称" required>
          <input
            className="form-input"
            value={pkgForm.name}
            onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
          />
        </Field>
        <Field label="关联课程" hint="可留空(通用课时包)">
          <select
            className="form-input"
            value={pkgForm.courseId}
            onChange={(e) => setPkgForm({ ...pkgForm, courseId: e.target.value })}
          >
            <option value="">— 不关联 —</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </Field>
        <FieldRow>
          <Field label="课时数(节)">
            <input
              className="form-input"
              type="number"
              value={pkgForm.lessonCount}
              onChange={(e) => setPkgForm({ ...pkgForm, lessonCount: e.target.value })}
            />
          </Field>
          <Field label="价格(元)">
            <input
              className="form-input"
              type="number"
              value={pkgForm.priceYuan}
              onChange={(e) => setPkgForm({ ...pkgForm, priceYuan: e.target.value })}
            />
          </Field>
        </FieldRow>
        <Field label="说明">
          <textarea
            className="form-input h-20"
            value={pkgForm.description}
            onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
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
        onConfirm={confirmArchiveCourse}
        onCancel={() => setArchiveTarget(null)}
      />
    </PageFrame>
  );
}
