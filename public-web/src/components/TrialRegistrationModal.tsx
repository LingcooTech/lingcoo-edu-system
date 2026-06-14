import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check } from 'lucide-react';

import {
  submitTrialRegistration,
  type Course,
  type PublicCampus,
  type PublicTeacher,
} from '@/api/client';
import { getAttribution } from '@/lib/attribution';

import { Modal } from './Modal';

const emptyForm = {
  guardianName: '',
  phone: '',
  studentName: '',
  grade: '',
  campusId: '',
  preferredTeacherId: '',
};

export function TrialRegistrationModal({
  open,
  course,
  campuses,
  teachers,
  onClose,
}: {
  open: boolean;
  course: Course | null;
  campuses: PublicCampus[];
  teachers: PublicTeacher[];
  onClose: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const activeTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.status !== 'archived'),
    [teachers],
  );

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm,
      campusId: campuses[0]?.id ?? '',
      preferredTeacherId: activeTeachers[0]?.id ?? '',
    });
    setError('');
    setDone(false);
    setSubmitting(false);
  }, [activeTeachers, campuses, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!course) return;
    if (campuses.length > 0 && !form.campusId) {
      setError('请选择意向校区');
      return;
    }
    if (activeTeachers.length > 0 && !form.preferredTeacherId) {
      setError('请选择意向老师');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const attribution = getAttribution();
      await submitTrialRegistration({
        guardianName: form.guardianName.trim(),
        phone: form.phone.trim(),
        studentName: form.studentName.trim(),
        grade: form.grade.trim(),
        campusId: form.campusId || undefined,
        courseId: course.id,
        preferredTeacherId: form.preferredTeacherId || undefined,
        source: attribution.source ?? 'course_detail',
        campaign: attribution.campaign,
        course: course.slug,
        medium: attribution.medium,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open && Boolean(course)}
      onClose={onClose}
      title="预约试听"
      panelClassName="max-w-lg"
    >
      {course ? (
        done ? (
          <section className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-green-600">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div className="mt-3 text-base font-bold text-green-800">预约已提交</div>
            <p className="mt-1 text-sm text-green-700">老师会尽快联系您确认试听时间。</p>
            <button type="button" className="pwbtn pwbtn-primary mt-4 w-full" onClick={onClose}>
              完成
            </button>
          </section>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <section className="bg-paper rounded-2xl p-4">
              <div className="text-ink text-sm font-semibold">{course.name}</div>
              <div className="text-muted mt-1 text-xs">
                {course.category} · {course.ageRange} · {course.durationMinutes} 分钟/节
              </div>
            </section>

            <div className="grid gap-3">
              <input
                className="border-line bg-surface rounded-xl border px-3 py-2.5 text-sm"
                placeholder="家长姓名"
                value={form.guardianName}
                onChange={(event) => setForm({ ...form, guardianName: event.target.value })}
                required
              />
              <input
                className="border-line bg-surface rounded-xl border px-3 py-2.5 text-sm"
                placeholder="手机号"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="border-line bg-surface rounded-xl border px-3 py-2.5 text-sm"
                  placeholder="孩子姓名"
                  value={form.studentName}
                  onChange={(event) => setForm({ ...form, studentName: event.target.value })}
                  required
                />
                <input
                  className="border-line bg-surface rounded-xl border px-3 py-2.5 text-sm"
                  placeholder="年级 / 年龄"
                  value={form.grade}
                  onChange={(event) => setForm({ ...form, grade: event.target.value })}
                  required
                />
              </div>
              {campuses.length > 0 ? (
                <select
                  className="border-line bg-surface rounded-xl border px-3 py-2.5 text-sm"
                  value={form.campusId}
                  onChange={(event) => setForm({ ...form, campusId: event.target.value })}
                  required
                >
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.address ? `${campus.name} · ${campus.address}` : campus.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {activeTeachers.length > 0 ? (
                <select
                  className="border-line bg-surface rounded-xl border px-3 py-2.5 text-sm"
                  value={form.preferredTeacherId}
                  onChange={(event) => setForm({ ...form, preferredTeacherId: event.target.value })}
                  required
                >
                  {activeTeachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.title ? `${teacher.name} · ${teacher.title}` : teacher.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            <button type="submit" className="pwbtn pwbtn-primary w-full" disabled={submitting}>
              {submitting ? '提交中...' : '提交预约'}
            </button>
          </form>
        )
      ) : null}
    </Modal>
  );
}
