import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { Institution, Teacher } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field } from '@/components/shared/FormField';
import { QiniuGalleryField, QiniuImageField } from '@/components/shared/QiniuImageField';
import { StatusPill, statusLabel, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

const TEACHERS = () => '/v1/teachers';

interface TeacherSaveResponse {
  teacher: Teacher;
  accountCreated?: boolean;
  defaultPassword?: string;
  accountWarning?: string;
}

interface TeacherForm {
  name: string;
  phone: string;
  title: string;
  avatarUrl: string;
  institutionId: string;
  tagline: string;
  wechatQrUrl: string;
  education: string;
  teachingExperience: string;
  teachingStyle: string;
  achievements: string;
  teachingYears: string;
  studentCount: string;
  practiceDuration: string;
  teachingPhilosophy: string;
  classPhotoUrlsText: string;
  studentWorkUrlsText: string;
  parentTestimonialsText: string;
  specialties: string;
  isPinned: boolean;
  status: 'active' | 'archived';
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(value?: string[] | null): string {
  return (value ?? []).join('\n');
}

const emptyTeacherForm: TeacherForm = {
  name: '',
  phone: '',
  title: '',
  avatarUrl: '',
  institutionId: '',
  tagline: '',
  wechatQrUrl: '',
  education: '',
  teachingExperience: '',
  teachingStyle: '',
  achievements: '',
  teachingYears: '',
  studentCount: '',
  practiceDuration: '',
  teachingPhilosophy: '',
  classPhotoUrlsText: '',
  studentWorkUrlsText: '',
  parentTestimonialsText: '',
  specialties: '',
  isPinned: false,
  status: 'active',
};

interface EmbeddedCreateAction {
  label: string;
  onClick: () => void;
}

export function TeachersPage({
  embedded = false,
  onCreateActionChange,
}: {
  embedded?: boolean;
  onCreateActionChange?: (action: EmbeddedCreateAction | null) => void;
} = {}) {
  const toast = useToast();
  const { data: teachers, setData: setTeachers } = useApiResource<Teacher>(TEACHERS(), 'teachers');
  const { data: institutions } = useApiResource<Institution>('/v1/institutions', 'institutions');
  const institutionNameById = new Map(institutions.map((item) => [item.id, item.name]));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState<TeacherForm>(emptyTeacherForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);

  const openEditor = useCallback((teacher?: Teacher) => {
    setEditing(teacher ?? null);
    setForm(
      teacher
        ? {
            name: teacher.name,
            phone: teacher.phone ?? '',
            title: teacher.title ?? '',
            avatarUrl: teacher.avatarUrl ?? '',
            institutionId: teacher.institutionId ?? '',
            tagline: teacher.tagline ?? '',
            wechatQrUrl: teacher.wechatQrUrl ?? '',
            education: teacher.education ?? '',
            teachingExperience: teacher.teachingExperience ?? '',
            teachingStyle: teacher.teachingStyle ?? '',
            achievements: teacher.achievements ?? '',
            teachingYears: teacher.teachingYears ?? '',
            studentCount: teacher.studentCount ?? '',
            practiceDuration: teacher.practiceDuration ?? teacher.retentionRate ?? '',
            teachingPhilosophy: teacher.teachingPhilosophy ?? '',
            classPhotoUrlsText: listToLines(teacher.classPhotoUrls),
            studentWorkUrlsText: listToLines(teacher.studentWorkUrls),
            parentTestimonialsText: listToLines(teacher.parentTestimonials),
            specialties: teacher.specialties.join('、'),
            isPinned: Boolean(teacher.isPinned),
            status: teacher.status as TeacherForm['status'],
          }
        : emptyTeacherForm,
    );
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!embedded) return;
    onCreateActionChange?.({ label: '新增老师', onClick: () => openEditor() });
    return () => onCreateActionChange?.(null);
  }, [embedded, onCreateActionChange, openEditor]);

  async function submit() {
    if (!form.name.trim()) {
      toast.error('老师姓名必填');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        title: form.title.trim(),
        avatarUrl: form.avatarUrl.trim(),
        institutionId: form.institutionId || null,
        tagline: form.tagline.trim(),
        wechatQrUrl: form.wechatQrUrl.trim(),
        education: form.education.trim(),
        teachingExperience: form.teachingExperience.trim(),
        teachingStyle: form.teachingStyle.trim(),
        achievements: form.achievements.trim(),
        teachingYears: form.teachingYears.trim(),
        studentCount: form.studentCount.trim(),
        practiceDuration: form.practiceDuration.trim(),
        teachingPhilosophy: form.teachingPhilosophy.trim(),
        classPhotoUrls: linesToList(form.classPhotoUrlsText),
        studentWorkUrls: linesToList(form.studentWorkUrlsText),
        parentTestimonials: linesToList(form.parentTestimonialsText),
        specialties: form.specialties
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
        isPinned: form.isPinned,
        status: form.status,
      };
      if (editing) {
        const result = await apiPatch<TeacherSaveResponse>(`${TEACHERS()}/${editing.id}`, payload);
        setTeachers(
          teachers.map((item) => (item.id === result.teacher.id ? result.teacher : item)),
        );
        surfaceSave(result);
      } else {
        const result = await apiPost<TeacherSaveResponse>(TEACHERS(), payload);
        setTeachers([result.teacher, ...teachers]);
        surfaceSave(result);
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  // A teacher with a phone number gets a login account auto-provisioned; show
  // the generated password (or a collision warning) so staff can hand it over.
  function surfaceSave(result: TeacherSaveResponse) {
    if (result.accountCreated && result.defaultPassword) {
      toast.success(
        `老师已保存；已自动创建登录账号，初始密码：${result.defaultPassword}（登录后请尽快修改）`,
      );
    } else {
      toast.success('老师已保存');
    }
    if (result.accountWarning) {
      toast.error(result.accountWarning);
    }
  }

  async function deleteTeacher() {
    if (!deleteTarget) return;
    try {
      const { teacher } = await apiDelete<{ teacher: Teacher }>(`${TEACHERS()}/${deleteTarget.id}`);
      setTeachers(teachers.filter((item) => item.id !== teacher.id));
      setDeleteTarget(null);
      toast.success('老师已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  const content = (
    <>
      <DataTable
        columns={[
          { key: 'name', header: '老师', cell: (row) => row.name },
          { key: 'phone', header: '电话', cell: (row) => row.phone ?? '-' },
          {
            key: 'institution',
            header: '机构',
            cell: (row) =>
              row.institutionId ? (institutionNameById.get(row.institutionId) ?? '-') : '-',
          },
          { key: 'spec', header: '擅长', cell: (row) => row.specialties.join('、') || '-' },
          {
            key: 'status',
            header: '状态',
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.isPinned ? <StatusPill tone="warn" label="置顶" /> : null}
                <StatusPill tone={statusToTone(row.status)} label={row.status} />
              </div>
            ),
          },
          {
            key: 'actions',
            header: '操作',
            cell: (row) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => openEditor(row)}
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
        data={teachers}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑老师' : '新增老师'}
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
        <Field label="姓名" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="电话">
          <input
            className="form-input"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
        <Field label="职称 / 头衔" hint="如「教学主管」「资深书法老师」">
          <input
            className="form-input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <Field label="一句话简介" hint="展示在家长端教师卡片与详情页顶部">
          <input
            className="form-input"
            value={form.tagline}
            onChange={(event) => setForm({ ...form, tagline: event.target.value })}
          />
        </Field>
        <Field label="所属机构" hint="可选，前台按机构分组展示">
          <select
            className="form-input"
            value={form.institutionId}
            onChange={(event) => setForm({ ...form, institutionId: event.target.value })}
          >
            <option value="">未绑定</option>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>
                {institution.name}
              </option>
            ))}
          </select>
        </Field>
        <QiniuImageField
          label="头像图片 URL"
          hint="可选，展示在家长端教师卡片"
          value={form.avatarUrl}
          onChange={(avatarUrl) => setForm({ ...form, avatarUrl })}
          prefix="teachers/avatar"
          previewAlt="老师头像"
        />
        <QiniuImageField
          label="个人微信二维码"
          hint="可选，展示在教师详情页，家长可扫码加微信"
          value={form.wechatQrUrl}
          onChange={(wechatQrUrl) => setForm({ ...form, wechatQrUrl })}
          prefix="teachers/wechat-qr"
          previewAlt="老师微信二维码"
        />
        <Field label="擅长" hint="用顿号或逗号分隔">
          <input
            className="form-input"
            value={form.specialties}
            onChange={(event) => setForm({ ...form, specialties: event.target.value })}
          />
        </Field>
        <label className="border-border/70 bg-muted/20 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPinned}
            onChange={(event) => setForm({ ...form, isPinned: event.target.checked })}
          />
          <span>首页师资团队置顶展示</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <Field label="教学年限">
            <input
              className="form-input"
              placeholder="如 8年"
              value={form.teachingYears}
              onChange={(event) => setForm({ ...form, teachingYears: event.target.value })}
            />
          </Field>
          <Field label="累计学员">
            <input
              className="form-input"
              placeholder="如 500+"
              value={form.studentCount}
              onChange={(event) => setForm({ ...form, studentCount: event.target.value })}
            />
          </Field>
          <Field label="专业积累">
            <input
              className="form-input"
              placeholder="如 8年 / 3000小时 / 专业训练经历"
              value={form.practiceDuration}
              onChange={(event) => setForm({ ...form, practiceDuration: event.target.value })}
            />
          </Field>
        </div>
        <Field label="教学理念" hint="展示在教师详情页靠前位置">
          <textarea
            className="form-input min-h-28"
            rows={4}
            value={form.teachingPhilosophy}
            onChange={(event) => setForm({ ...form, teachingPhilosophy: event.target.value })}
          />
        </Field>
        <QiniuGalleryField
          label="课堂照片"
          hint="用于教师详情页课堂实拍模块，可批量上传或从素材库勾选多张"
          value={form.classPhotoUrlsText}
          onChange={(classPhotoUrlsText) => setForm({ ...form, classPhotoUrlsText })}
          prefix="teachers/class-photos"
        />
        <QiniuGalleryField
          label="学员作品"
          hint="用于教师详情页学员作品模块，可放前后对比图"
          value={form.studentWorkUrlsText}
          onChange={(studentWorkUrlsText) => setForm({ ...form, studentWorkUrlsText })}
          prefix="teachers/student-works"
        />
        <Field label="家长评价" hint="每行一条，建议 3-5 条">
          <textarea
            className="form-input min-h-28"
            rows={4}
            value={form.parentTestimonialsText}
            onChange={(event) => setForm({ ...form, parentTestimonialsText: event.target.value })}
          />
        </Field>
        <Field label="毕业院校 / 专业背景" hint="如毕业院校、专业、师承背景等">
          <textarea
            className="form-input min-h-24"
            rows={3}
            value={form.education}
            onChange={(event) => setForm({ ...form, education: event.target.value })}
          />
        </Field>
        <Field label="教学经验" hint="如从教年限、授课对象、课程研发经历等">
          <textarea
            className="form-input min-h-28"
            rows={4}
            value={form.teachingExperience}
            onChange={(event) => setForm({ ...form, teachingExperience: event.target.value })}
          />
        </Field>
        <Field label="教学风格" hint="如课堂节奏、沟通方式、对孩子的引导特点">
          <textarea
            className="form-input min-h-28"
            rows={4}
            value={form.teachingStyle}
            onChange={(event) => setForm({ ...form, teachingStyle: event.target.value })}
          />
        </Field>
        <Field label="荣誉奖项 / 代表经历" hint="一行一条，前台会自动排成重点列表">
          <textarea
            className="form-input min-h-32"
            rows={5}
            value={form.achievements}
            onChange={(event) => setForm({ ...form, achievements: event.target.value })}
          />
        </Field>
        <Field label="状态">
          <select
            className="form-input"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as TeacherForm['status'] })
            }
          >
            <option value="active">{statusLabel('active')}</option>
            <option value="archived">{statusLabel('archived')}</option>
          </select>
        </Field>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除老师？"
        message={`确认删除「${deleteTarget?.name ?? ''}」？如果老师已被班级或课次引用，系统会阻止删除。`}
        confirmLabel="删除"
        danger
        onConfirm={deleteTeacher}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <PageFrame
      section="teachers"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => openEditor()}>
          <Plus className="h-4 w-4" />
          新增老师
        </button>
      }
    >
      {content}
    </PageFrame>
  );
}
