import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, Sparkles, UserRound } from 'lucide-react';

import {
  fetchCoursePackages,
  getTenantSlug,
  publicApi,
  type Course,
  type CoursePackage,
  type HomePayload,
  type TrialSession,
} from '@/api/client';
import { formatDateTime, money } from '@/lib/utils';

interface FormState {
  guardianName: string;
  phone: string;
  studentName: string;
  grade: string;
  courseId: string;
  trialSessionId: string;
}

const initialForm: FormState = {
  guardianName: '',
  phone: '',
  studentName: '',
  grade: '',
  courseId: '',
  trialSessionId: '',
};

export function HomePage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [packages, setPackages] = useState<CoursePackage[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const tenantSlug = getTenantSlug();

  const source = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('source') ?? 'unknown';
  }, []);

  useEffect(() => {
    publicApi<HomePayload>(`/public/${tenantSlug}/home`).then((payload) => {
      setHome(payload);
      setForm((prev) => ({
        ...prev,
        courseId: payload.featuredCourses[0]?.id ?? '',
        trialSessionId: payload.trialSessions[0]?.id ?? '',
      }));
    });
    fetchCoursePackages()
      .then(setPackages)
      .catch(() => setPackages([]));
  }, [tenantSlug]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const payload = await publicApi<{ message: string }>(
        `/public/${tenantSlug}/trial-registrations`,
        {
          method: 'POST',
          body: JSON.stringify({ ...form, source }),
        },
      );
      setMessage(payload.message);
      setForm(initialForm);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  const courses = home?.featuredCourses ?? [];
  const sessions = home?.trialSessions ?? [];

  return (
    <main className="min-h-screen">
      <section className="bg-gradient-to-br from-blue-600 to-indigo-700 px-5 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              社区小班成长教室
            </div>
            <Link
              to="/account"
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"
            >
              <UserRound className="h-3.5 w-3.5" />
              家长中心
            </Link>
          </div>
          <h1 className="mt-5 text-3xl leading-tight font-bold">
            {home?.tenant.brandName ?? '美智优品儿童成长教室'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-blue-50">
            {home?.tenant.publicProfile.introduction ??
              '书法、美术、手工、阅读表达、幼小衔接等社区小班课程。扫码预约试听，老师会尽快联系确认时间。'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/about"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700"
            >
              了解机构
            </Link>
            <a
              href="#booking"
              className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white"
            >
              预约试听
            </a>
          </div>
          <div className="mt-5 space-y-2 text-sm text-blue-50">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {home?.tenant.address ?? '社区门店一楼成长教室'}
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              {home?.tenant.phone ?? '13800000000'}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
              Courses
            </div>
            <h2 className="mt-1 text-xl font-bold">推荐课程</h2>
          </div>
          <a className="text-sm font-medium text-blue-600" href="#booking">
            预约试听
          </a>
        </div>
        <div className="grid gap-3">
          {courses.map((course: Course) => (
            <article key={course.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{course.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {course.category} · {course.ageRange}
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700">
                  {money(course.priceAmount)}
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{course.summary}</p>
              <div className="mt-3 text-xs text-slate-500">
                {course.lessonCount} 节 · 单节 {course.durationMinutes} 分钟
              </div>
            </article>
          ))}
        </div>
      </section>

      {packages.length > 0 && (
        <section className="mx-auto max-w-3xl px-5 pb-6">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
              Packages
            </div>
            <h2 className="mt-1 text-xl font-bold">课时包</h2>
          </div>
          <div className="grid gap-3">
            {packages.map((pkg: CoursePackage) => (
              <article key={pkg.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{pkg.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{pkg.lessonCount} 课时</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700">
                    {money(pkg.priceAmount)}
                  </div>
                </div>
                {pkg.description && (
                  <p className="mt-3 text-sm leading-6 text-slate-600">{pkg.description}</p>
                )}
                <Link
                  to={`/checkout/${pkg.id}`}
                  className="mt-3 block rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  购买课时包
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-5 pb-6">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Trial</div>
          <h2 className="mt-1 text-xl font-bold">本周公开课</h2>
        </div>
        <div className="grid gap-3">
          {sessions.map((session: TrialSession) => (
            <article key={session.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold">{session.title}</div>
              <div className="mt-2 text-sm text-slate-600">{formatDateTime(session.startsAt)}</div>
              <div className="mt-2 text-xs text-slate-500">
                已报名 {session.bookedCount}/{session.capacity}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="booking" className="mx-auto max-w-3xl px-5 pb-10">
        <form className="rounded-2xl border bg-white p-5 shadow-sm" onSubmit={submit}>
          <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Booking</div>
          <h2 className="mt-1 text-xl font-bold">预约试听 / 公开课</h2>
          <div className="mt-4 grid gap-3">
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="家长姓名"
              value={form.guardianName}
              onChange={(event) => setForm({ ...form, guardianName: event.target.value })}
              required
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="手机号"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              required
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="孩子姓名"
              value={form.studentName}
              onChange={(event) => setForm({ ...form, studentName: event.target.value })}
              required
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="年级 / 年龄"
              value={form.grade}
              onChange={(event) => setForm({ ...form, grade: event.target.value })}
              required
            />
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={form.courseId}
              onChange={(event) => setForm({ ...form, courseId: event.target.value })}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={form.trialSessionId}
              onChange={(event) => setForm({ ...form, trialSessionId: event.target.value })}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </div>
          <button
            className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? '提交中...' : '提交预约'}
          </button>
          {message && (
            <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</div>
          )}
          <div className="mt-3 text-center text-xs text-slate-400">来源参数：{source}</div>
        </form>
      </section>
    </main>
  );
}
