import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Clock, GraduationCap, Layers } from 'lucide-react';

import { fetchCourse, type Course, type CoursePackage } from '@/api/client';
import { Layout } from '@/components/Layout';
import { money } from '@/lib/utils';

export function CourseDetailPage() {
  const { slug = '' } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [packages, setPackages] = useState<CoursePackage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');

  useEffect(() => {
    setStatus('loading');
    fetchCourse(slug)
      .then((payload) => {
        setCourse(payload.course);
        setPackages(payload.coursePackages);
        setStatus('ready');
      })
      .catch(() => setStatus('notfound'));
  }, [slug]);

  if (status === 'loading') {
    return (
      <Layout>
        <div className="container-narrow text-muted py-12 text-sm">加载中…</div>
      </Layout>
    );
  }

  if (status === 'notfound' || !course) {
    return (
      <Layout>
        <div className="container-narrow py-12 text-center">
          <p className="text-ink-soft text-sm">课程不存在或已下架。</p>
          <Link to="/courses" className="pwbtn pwbtn-outline mt-4">
            查看全部课程
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <article className="container-narrow py-6">
        <Link to="/courses" className="text-muted hover:text-ink inline-flex items-center text-sm">
          <ChevronLeft className="h-4 w-4" />
          全部课程
        </Link>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip">{course.category}</span>
          <span className="chip">{course.ageRange}</span>
        </div>
        <h1 className="text-ink mt-3 text-2xl font-bold">{course.name}</h1>
        <p className="text-ink-soft mt-2 text-sm leading-6">{course.summary}</p>

        <div className="text-ink-soft mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-4 w-4" />
            {course.lessonCount} 节
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            单节 {course.durationMinutes} 分钟
          </span>
          <span className="text-ink inline-flex items-center gap-1.5 font-semibold">
            <GraduationCap className="h-4 w-4" />
            {money(course.priceAmount)}
          </span>
        </div>

        {course.content && (
          <div className="text-ink-soft mt-6 text-sm leading-7 whitespace-pre-line">
            {course.content}
          </div>
        )}

        {packages.length > 0 && (
          <section className="mt-8">
            <h2 className="text-ink text-base font-semibold">课时包</h2>
            <div className="mt-3 grid gap-3">
              {packages.map((pkg) => (
                <div key={pkg.id} className="pwcard p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-ink text-sm font-semibold">{pkg.name}</div>
                      <div className="text-muted mt-1 text-xs">{pkg.lessonCount} 课时</div>
                    </div>
                    <div className="text-ink text-sm font-semibold">{money(pkg.priceAmount)}</div>
                  </div>
                  {pkg.description && (
                    <p className="text-ink-soft mt-2 text-sm leading-6">{pkg.description}</p>
                  )}
                  <Link to={`/checkout/${pkg.id}`} className="pwbtn pwbtn-outline mt-3 w-full">
                    购买课时包
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </article>

      {/* Sticky primary CTA: lead-first (no login required). */}
      <div className="border-line bg-surface/95 sticky bottom-0 border-t backdrop-blur">
        <div className="container-narrow flex items-center gap-3 py-3">
          <div className="text-ink-soft flex-1 text-xs">免注册 · 老师电话确认时间</div>
          <Link to={`/register?course=${course.slug}`} className="pwbtn pwbtn-primary flex-1">
            预约试听 / 留资
          </Link>
        </div>
      </div>
    </Layout>
  );
}
