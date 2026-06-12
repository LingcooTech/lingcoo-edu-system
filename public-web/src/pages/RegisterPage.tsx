import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  fetchCourses,
  fetchTrialSessions,
  submitTrialRegistration,
  type Course,
  type TrialSession,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { getAttribution } from '@/lib/attribution';
import { useSeo } from '@/lib/seo';
import { formatDateTime, money } from '@/lib/utils';

const initialForm = {
  guardianName: '',
  phone: '',
  studentName: '',
  grade: '',
  courseId: '',
  trialSessionId: '',
};

export function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<TrialSession[]>([]);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useSeo({
    title: '预约试听',
    description: '填写孩子和联系方式，预约一次真实课堂体验。',
  });

  useEffect(() => {
    Promise.all([fetchCourses(), fetchTrialSessions()])
      .then(([courseList, sessionList]) => {
        setCourses(courseList);
        setSessions(sessionList);
        const courseSlug = params.get('course');
        const trialId = params.get('trial');
        setForm((prev) => ({
          ...prev,
          courseId: courseList.find((c) => c.slug === courseSlug)?.id ?? prev.courseId,
          trialSessionId: sessionList.find((s) => s.id === trialId)?.id ?? prev.trialSessionId,
        }));
      })
      .catch(() => undefined);
  }, [params]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const selectedSession = sessions.find((session) => session.id === form.trialSessionId);
      if (selectedSession && selectedSession.reservationFeeAmount > 0) {
        navigate(`/trials/${selectedSession.id}`, {
          state: {
            trialRegistration: {
              guardianName: form.guardianName,
              phone: form.phone,
              studentName: form.studentName,
              grade: form.grade,
            },
          },
        });
        return;
      }

      const attribution = getAttribution();
      await submitTrialRegistration({
        guardianName: form.guardianName,
        phone: form.phone,
        studentName: form.studentName,
        grade: form.grade,
        courseId: form.courseId || undefined,
        trialSessionId: form.trialSessionId || undefined,
        source: attribution.source ?? 'unknown',
        campaign: attribution.campaign,
        course: attribution.course,
        medium: attribution.medium,
      });
      navigate('/register/success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'border-line w-full rounded-xl border bg-surface px-3.5 py-3 text-sm';

  return (
    <Layout>
      <section className="container-narrow py-8">
        <div className="eyebrow">预约试听</div>
        <h1 className="text-ink mt-1 text-2xl font-bold">预约试听 / 留资</h1>
        <p className="text-ink-soft mt-2 text-sm leading-6">
          填写下方信息即可，无需注册。老师会尽快联系您确认上课时间。
        </p>

        <form className="pwcard mt-5 space-y-3 p-5" onSubmit={submit}>
          <input
            className={inputClass}
            placeholder="家长姓名"
            value={form.guardianName}
            onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
            required
          />
          <input
            className={inputClass}
            placeholder="手机号"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
          <input
            className={inputClass}
            placeholder="孩子姓名"
            value={form.studentName}
            onChange={(e) => setForm({ ...form, studentName: e.target.value })}
            required
          />
          <input
            className={inputClass}
            placeholder="年级 / 年龄"
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
            required
          />
          <select
            className={inputClass}
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
          >
            <option value="">意向课程(可选)</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={form.trialSessionId}
            onChange={(e) => setForm({ ...form, trialSessionId: e.target.value })}
          >
            <option value="">意向公开课(可选)</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {formatDateTime(session.startsAt)}
                {session.reservationFeeAmount > 0
                  ? ` · ${money(session.reservationFeeAmount)}席位保留费`
                  : ''}
              </option>
            ))}
          </select>

          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <button type="submit" className="pwbtn pwbtn-primary w-full" disabled={submitting}>
            {submitting ? '提交中...' : '提交预约'}
          </button>
        </form>
      </section>
    </Layout>
  );
}
