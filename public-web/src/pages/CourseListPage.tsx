import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock } from 'lucide-react';

import {
  fetchCourses,
  loadHome,
  type BusinessModelSettings,
  type Course,
  type HomePayload,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { getPageCopy } from '@/lib/page-copy';
import { useSeo } from '@/lib/seo';
import { money } from '@/lib/utils';

function coursePriceLabel(course: Course, businessModel?: BusinessModelSettings) {
  if (
    !course.packageCount ||
    course.startingPriceAmount === null ||
    course.startingPriceAmount === undefined
  ) {
    return '可预约试听';
  }
  return businessModel?.onlinePackageSalesEnabled
    ? `${money(course.startingPriceAmount)} 起`
    : `${money(course.startingPriceAmount)} 参考`;
}

function coursePlanLabel(course: Course, businessModel?: BusinessModelSettings) {
  if (course.packageCount) {
    return businessModel?.onlinePackageSalesEnabled
      ? `${course.packageCount} 个课时包`
      : `${course.packageCount} 个参考方案`;
  }
  return businessModel?.onlinePackageSalesEnabled ? '暂未上架课时包' : '暂无参考方案';
}

function filterClass(active: boolean) {
  return [
    'inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
    active
      ? 'border-ink bg-ink text-white'
      : 'border-line bg-surface text-ink-soft hover:border-brand/50 hover:text-ink',
  ].join(' ');
}

export function CourseListPage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [businessModel, setBusinessModel] = useState<BusinessModelSettings | undefined>();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    Promise.all([fetchCourses(), loadHome().catch(() => null)])
      .then(([courseList, home]) => {
        setCourses(courseList);
        setHome(home);
        setBusinessModel(home?.organization.businessModel);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => Array.from(new Set(courses.map((c) => c.category))), [courses]);
  const visible = useMemo(
    () => (category === 'all' ? courses : courses.filter((c) => c.category === category)),
    [courses, category],
  );
  const pageCopy = getPageCopy(home, 'courses');

  useSeo({
    title: pageCopy.title,
    description: pageCopy.subtitle,
    brandName: home?.organization.brandName,
  });

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">{pageCopy.eyebrow}</div>
        <h1 className="section-title mt-2">{pageCopy.title}</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          {pageCopy.subtitle}
        </p>
        {!loading && courses.length > 0 && (
          <p className="text-muted mt-3 text-xs">
            共 {courses.length} 门课程
            {category !== 'all' ? ` · 当前「${category}」${visible.length} 门` : ''}
          </p>
        )}

        {categories.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className={filterClass(category === 'all')}
              onClick={() => setCategory('all')}
            >
              全部
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={filterClass(category === item)}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <CourseCardSkeleton key={index} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((course) => (
              <Link
                key={course.id}
                to={`/courses/${course.slug}`}
                className="pwcard pwcard-hover flex flex-col overflow-hidden no-underline"
              >
                {course.coverImageUrl ? (
                  <div className="bg-brand-soft aspect-[16/9] overflow-hidden">
                    <img
                      src={course.coverImageUrl}
                      alt={course.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="chip">{course.category}</span>
                    <span className="chip">{course.ageRange}</span>
                  </div>
                  <h2 className="text-ink mt-3 text-base font-semibold">{course.name}</h2>
                  <p className="text-ink-soft mt-2 line-clamp-2 flex-1 text-sm leading-6">
                    {course.summary}
                  </p>
                  <div className="border-line mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-muted inline-flex items-center gap-1.5 text-xs">
                      <Clock className="h-3.5 w-3.5" />
                      {coursePlanLabel(course, businessModel)} · {course.durationMinutes} 分钟
                    </span>
                    <span className="text-ink text-sm font-semibold">
                      {coursePriceLabel(course, businessModel)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

function CourseCardSkeleton() {
  return (
    <div className="pwcard overflow-hidden">
      <div className="skeleton aspect-[16/9]" />
      <div className="p-5">
        <div className="flex gap-1.5">
          <div className="skeleton h-5 w-14" />
          <div className="skeleton h-5 w-16" />
        </div>
        <div className="skeleton mt-3 h-5 w-2/3" />
        <div className="skeleton mt-3 h-3.5 w-full" />
        <div className="skeleton mt-2 h-3.5 w-4/5" />
        <div className="border-line mt-4 flex items-center justify-between border-t pt-3">
          <div className="skeleton h-3.5 w-32" />
          <div className="skeleton h-4 w-12" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="pwcard mt-7 flex flex-col items-center px-6 py-14 text-center">
      <div className="bg-brand-soft text-brand flex h-12 w-12 items-center justify-center rounded-2xl">
        <BookOpen className="h-6 w-6" />
      </div>
      <p className="text-ink mt-4 text-sm font-medium">该分类下暂无课程</p>
      <p className="text-muted mt-1 text-sm">可以先预约试听，老师会推荐适合孩子的课程。</p>
      <Link to="/register" className="pwbtn pwbtn-primary mt-5">
        预约试听
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
