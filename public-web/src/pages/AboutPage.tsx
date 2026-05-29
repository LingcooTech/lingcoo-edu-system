import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck, CheckCircle2, MapPin, Phone, ShieldCheck } from 'lucide-react';

import { getTenantSlug, publicApi, type Course, type HomePayload } from '@/api/client';

export function AboutPage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const tenantSlug = getTenantSlug();

  useEffect(() => {
    publicApi<HomePayload>(`/public/${tenantSlug}/home`)
      .then(setHome)
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  if (loading) {
    return <main className="px-5 py-10 text-center text-sm text-slate-500">加载中...</main>;
  }

  const profile = home?.tenant.publicProfile;
  const courses = home?.featuredCourses ?? [];
  const campuses = home?.campuses ?? [];

  return (
    <main className="min-h-screen bg-slate-50">
      <section
        className="relative min-h-[68vh] bg-cover bg-center px-5 py-7 text-white"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(15, 23, 42, 0.68), rgba(15, 23, 42, 0.86)), url('https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1600&q=80')",
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          <Link to="/" className="inline-flex w-fit items-center gap-1 text-sm text-white/85">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
          <div className="pt-16">
            <div className="text-sm font-semibold text-blue-100">
              {home?.tenant.brandName ?? '儿童成长教室'}
            </div>
            <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-bold">
              {profile?.headline ?? '社区里的儿童成长教室'}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-100">
              {profile?.introduction}
            </p>
          </div>
          <div className="mt-10 grid gap-2 sm:grid-cols-3">
            {(profile?.promises ?? []).map((item) => (
              <div key={item} className="rounded-2xl bg-white/12 px-4 py-3 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="grid gap-3">
          {(profile?.highlights ?? []).map((item, index) => (
            <article key={item} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  {index === 0 ? (
                    <BookOpenCheck className="h-5 w-5" />
                  ) : index === 1 ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                </div>
                <p className="text-sm leading-6 text-slate-700">{item}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {courses.length > 0 && (
        <section className="mx-auto max-w-3xl px-5 pb-8">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
              Courses
            </div>
            <h2 className="mt-1 text-xl font-bold">课程方向</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.slice(0, 4).map((course: Course) => (
              <article key={course.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold">{course.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {course.category} · {course.ageRange}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{course.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-5 pb-10">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">Visit</div>
          <h2 className="mt-1 text-xl font-bold">校区与联系</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-blue-600" />
              <span>{home?.tenant.address ?? campuses[0]?.address ?? '社区门店一楼成长教室'}</span>
            </div>
            {campuses.map((campus) => (
              <div key={campus.id} className="ml-6 text-xs text-slate-500">
                {campus.name}
                {campus.address ? ` · ${campus.address}` : ''}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-600" />
              <span>{home?.tenant.phone ?? '请通过预约表单联系机构'}</span>
            </div>
          </div>
          <Link
            to="/#booking"
            className="mt-5 block rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
          >
            预约试听
          </Link>
        </div>
      </section>
    </main>
  );
}
