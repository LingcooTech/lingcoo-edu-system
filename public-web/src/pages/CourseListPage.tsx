import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchCourses, loadHome, type BusinessModelSettings, type Course } from '@/api/client';
import { Layout } from '@/components/Layout';
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

export function CourseListPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [businessModel, setBusinessModel] = useState<BusinessModelSettings | undefined>();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    Promise.all([fetchCourses(), loadHome().catch(() => null)])
      .then(([courseList, home]) => {
        setCourses(courseList);
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

  return (
    <Layout>
      <section className="container-narrow py-8">
        <div className="eyebrow">Courses</div>
        <h1 className="text-ink mt-1 text-2xl font-bold">全部课程</h1>

        {categories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={category === 'all' ? 'chip bg-ink text-white' : 'chip'}
              onClick={() => setCategory('all')}
            >
              全部
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? 'chip bg-ink text-white' : 'chip'}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 grid gap-3">
          {loading ? (
            <p className="text-muted text-sm">加载中…</p>
          ) : visible.length === 0 ? (
            <p className="text-muted text-sm">暂无课程</p>
          ) : (
            visible.map((course) => (
              <Link key={course.id} to={`/courses/${course.slug}`} className="pwcard block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-ink text-sm font-semibold">{course.name}</div>
                    <div className="text-muted mt-1 text-xs">
                      {course.category} · {course.ageRange}
                    </div>
                  </div>
                  <div className="text-ink shrink-0 text-sm font-semibold">
                    {coursePriceLabel(course, businessModel)}
                  </div>
                </div>
                <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-6">
                  {course.summary}
                </p>
                <div className="text-muted mt-2 text-xs">
                  {course.packageCount
                    ? businessModel?.onlinePackageSalesEnabled
                      ? `${course.packageCount} 个课时包`
                      : `${course.packageCount} 个参考方案`
                    : businessModel?.onlinePackageSalesEnabled
                      ? '暂未上架课时包'
                      : '暂无参考方案'}{' '}
                  · 单节 {course.durationMinutes} 分钟
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </Layout>
  );
}
