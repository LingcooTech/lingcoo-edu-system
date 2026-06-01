import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, CheckCircle2, MapPin, Phone, ShieldCheck } from 'lucide-react';

import { loadHome, type Course, type HomePayload } from '@/api/client';
import { Layout } from '@/components/Layout';

export function AboutPage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Layout>
        <main className="px-5 py-10 text-center text-sm text-slate-500">加载中...</main>
      </Layout>
    );
  }

  const organization = home?.organization;
  const profile = organization?.publicProfile;
  const courses = home?.featuredCourses ?? [];
  const campuses = home?.campuses ?? [];

  return (
    <Layout>
      <section className="border-line bg-surface border-b">
        <div className="container-narrow hero-grid">
          <div>
            <div className="eyebrow">{organization?.brandName ?? '儿童成长教室'}</div>
            <h1 className="text-ink mt-4 text-4xl leading-tight font-bold tracking-tight">
              {profile?.headline ?? '社区里的儿童成长教室'}
            </h1>
            <p className="text-ink-soft mt-5 text-base leading-8">{profile?.introduction}</p>
          </div>
          <div className="hero-media">
            <img src={profile?.bannerImageUrl} alt="机构环境" className="h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="container-narrow py-8">
        <div className="grid gap-4 md:grid-cols-3">
          {(profile?.promises ?? []).map((item, index) => (
            <article key={item} className="pwcard p-5">
              <div className="bg-brand-soft text-brand flex h-10 w-10 items-center justify-center rounded-2xl">
                {index === 0 ? <BookOpenCheck className="h-5 w-5" /> : index === 1 ? <ShieldCheck className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </div>
              <p className="text-ink-soft mt-4 text-sm leading-6">{item}</p>
            </article>
          ))}
        </div>
      </section>

      {courses.length > 0 && (
        <section className="container-narrow py-8">
          <div className="mb-4">
            <div className="eyebrow">Courses</div>
            <h2 className="section-title mt-1">课程方向</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {courses.slice(0, 4).map((course: Course) => (
              <article key={course.id} className="pwcard p-4">
                <div className="text-sm font-semibold">{course.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {course.category} · {course.ageRange}
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-soft">{course.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="container-narrow py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="pwcard p-5">
            <div className="eyebrow">Visit</div>
            <h2 className="section-title mt-1">校区与联系</h2>
            <div className="mt-4 space-y-3 text-sm text-ink-soft">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-brand" />
                <span>{organization?.address ?? campuses[0]?.address ?? '社区门店一楼成长教室'}</span>
              </div>
              {campuses.map((campus) => (
                <div key={campus.id} className="ml-6 text-xs text-muted">
                  {campus.name}
                  {campus.address ? ` · ${campus.address}` : ''}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand" />
                <span>{organization?.phone ?? '请通过预约表单联系机构'}</span>
              </div>
              {profile?.businessHours ? <div className="ml-6 text-xs text-muted">{profile.businessHours}</div> : null}
            </div>
            <Link to="/register" className="pwbtn pwbtn-primary mt-5">
              预约试听
            </Link>
          </div>

          <div className="pwcard p-5">
            <div className="eyebrow">FAQ</div>
            <h2 className="section-title mt-1">常见问题</h2>
            <div className="mt-4 space-y-3">
              {(profile?.faq ?? []).map((item) => (
                <div key={item} className="rounded-2xl bg-paper p-4 text-sm leading-6 text-ink-soft">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
