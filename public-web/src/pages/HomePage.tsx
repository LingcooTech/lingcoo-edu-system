import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin, MessageCircle, Phone, Star } from 'lucide-react';

import { loadHome, type Course, type HomePayload, type TrialSession } from '@/api/client';
import { Layout } from '@/components/Layout';
import { formatDateTime, money } from '@/lib/utils';

function coursePriceLabel(course: Course) {
  if (!course.packageCount || course.startingPriceAmount === null || course.startingPriceAmount === undefined) {
    return '可预约试听';
  }
  return `${money(course.startingPriceAmount)} 起`;
}

export function HomePage() {
  const [home, setHome] = useState<HomePayload | null>(null);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  const organization = home?.organization;
  const courses = home?.featuredCourses ?? [];
  const sessions = home?.trialSessions ?? [];
  const profile = organization?.publicProfile;
  const highlights = profile?.highlights ?? [];
  const stats = profile?.stats ?? [];
  const testimonials = profile?.testimonials ?? [];

  return (
    <Layout>
      <section className="border-line bg-surface border-b">
        <div className="container-narrow hero-grid">
          <div>
            <div className="eyebrow">社区小班成长教室</div>
            <h1 className="text-ink mt-4 text-4xl leading-tight font-bold tracking-tight md:text-5xl">
              {profile?.bannerTitle || profile?.headline || organization?.brandName || '儿童成长教室'}
            </h1>
            <p className="text-ink-soft mt-5 max-w-2xl text-base leading-8">
              {profile?.bannerSubtitle || profile?.introduction}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={profile?.ctaLink || '/register'} className="pwbtn pwbtn-primary">
                {profile?.ctaText || '预约试听'}
              </Link>
              <Link to="/courses" className="pwbtn pwbtn-outline">
                浏览课程
              </Link>
            </div>
            {stats.length > 0 && (
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {stats.map((item) => (
                  <div key={item} className="rounded-2xl bg-paper px-4 py-3 text-sm font-semibold">
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hero-media">
            <img
              src={profile?.bannerImageUrl}
              alt={organization?.brandName ?? '机构环境'}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {highlights.length > 0 && (
        <section className="container-narrow py-8">
          <div className="grid gap-3 md:grid-cols-3">
            {highlights.map((item, index) => (
              <article key={item} className="pwcard p-5">
                <div className="bg-brand-soft text-brand flex h-10 w-10 items-center justify-center rounded-2xl">
                  {index === 0 ? <Star className="h-5 w-5" /> : index === 1 ? <CalendarDays className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                </div>
                <p className="text-ink-soft mt-4 text-sm leading-6">{item}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="container-narrow py-8">
        <div className="grid gap-4 rounded-[2rem] bg-ink p-6 text-white md:grid-cols-2 md:p-8">
          <div>
            <div className="text-sm font-semibold text-white/60">Visit</div>
            <h2 className="mt-2 text-2xl font-bold">到店前先预约，老师会确认适合的班型</h2>
          </div>
          <div className="space-y-3 text-sm text-white/80">
            {organization?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {organization.address}
              </div>
            )}
            {organization?.phone && (
              <div className="flex items-center gap-2"><Phone className="h-4 w-4" />{organization.phone}</div>
            )}
            {profile?.businessHours && <div>{profile.businessHours}</div>}
          </div>
        </div>
      </section>

      {/* Featured courses */}
      <section className="container-narrow py-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="eyebrow">Courses</div>
            <h2 className="text-ink mt-1 text-xl font-bold">推荐课程</h2>
          </div>
          <Link to="/courses" className="text-brand inline-flex items-center gap-1 text-sm">
            查看全部
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {courses.map((course: Course) => (
            <Link key={course.id} to={`/courses/${course.slug}`} className="pwcard block p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-ink text-sm font-semibold">{course.name}</div>
                  <div className="text-muted mt-1 text-xs">
                    {course.category} · {course.ageRange}
                  </div>
                </div>
                <div className="text-ink shrink-0 text-sm font-semibold">
                  {coursePriceLabel(course)}
                </div>
              </div>
              <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-6">{course.summary}</p>
            </Link>
          ))}
          {courses.length === 0 && <p className="text-muted text-sm">课程即将上线</p>}
        </div>
      </section>

      {/* This week's public classes */}
      <section className="container-narrow pb-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="eyebrow">Trial</div>
            <h2 className="text-ink mt-1 text-xl font-bold">本周公开课</h2>
          </div>
          <Link to="/trials" className="text-brand inline-flex items-center gap-1 text-sm">
            全部公开课
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {sessions.map((session: TrialSession) => (
            <Link
              key={session.id}
              to={`/trials/${session.id}`}
              className="pwcard block p-4"
            >
              <div className="text-ink text-sm font-semibold">{session.title}</div>
              <div className="text-ink-soft mt-2 text-sm">{formatDateTime(session.startsAt)}</div>
              <div className="text-muted mt-2 text-xs">
                已报名 {session.bookedCount}/{session.capacity}
              </div>
            </Link>
          ))}
          {sessions.length === 0 && (
            <p className="text-muted text-sm">近期暂无公开课，可直接预约心仪课程的试听。</p>
          )}
        </div>
      </section>

      {testimonials.length > 0 && (
        <section className="container-narrow pb-10">
          <div className="mb-4">
            <div className="eyebrow">Testimonials</div>
            <h2 className="section-title mt-1">家长评价</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {testimonials.slice(0, 4).map((item) => (
              <blockquote key={item} className="pwcard p-5 text-sm leading-7 text-ink-soft">
                “{item}”
              </blockquote>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
