import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Phone } from 'lucide-react';

import { loadHome, type Course, type HomePayload, type TrialSession } from '@/api/client';
import { Layout } from '@/components/Layout';
import { formatDateTime, money } from '@/lib/utils';

export function HomePage() {
  const [home, setHome] = useState<HomePayload | null>(null);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  const tenant = home?.tenant;
  const courses = home?.featuredCourses ?? [];
  const sessions = home?.trialSessions ?? [];
  const highlights = tenant?.publicProfile.highlights ?? [];

  return (
    <Layout>
      {/* Hero */}
      <section className="border-line bg-surface border-b">
        <div className="container-narrow py-10">
          <div className="eyebrow">社区小班成长教室</div>
          <h1 className="text-ink mt-3 text-3xl leading-tight font-bold">
            {tenant?.publicProfile.headline ?? tenant?.brandName ?? '美智优品儿童成长教室'}
          </h1>
          <p className="text-ink-soft mt-3 text-sm leading-7">
            {tenant?.publicProfile.introduction ??
              '书法、美术、手工、阅读表达、幼小衔接等社区小班课程。扫码预约试听，老师会尽快联系确认时间。'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/register" className="pwbtn pwbtn-primary">
              预约试听 / 留资
            </Link>
            <Link to="/courses" className="pwbtn pwbtn-outline">
              浏览课程
            </Link>
          </div>
          {highlights.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {highlights.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>
          )}
          <div className="text-ink-soft mt-6 space-y-2 text-sm">
            {tenant?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {tenant.address}
              </div>
            )}
            {tenant?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {tenant.phone}
              </div>
            )}
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
        <div className="grid gap-3">
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
                  {money(course.priceAmount)}
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
        <div className="grid gap-3">
          {sessions.map((session: TrialSession) => (
            <Link
              key={session.id}
              to={`/register?trial=${session.id}`}
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
    </Layout>
  );
}
