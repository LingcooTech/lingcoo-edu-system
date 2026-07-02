import { ArrowLeft, ArrowRight, Building2, GraduationCap, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  fetchPublicInstitution,
  type Course,
  type InstitutionMediaItem,
  type PublicInstitutionDetail,
  type PublicTeacher,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { useSeo } from '@/lib/seo';
import { money } from '@/lib/utils';

function coursePriceLabel(course: Course, detail?: PublicInstitutionDetail) {
  if (
    !course.packageCount ||
    course.startingPriceAmount === null ||
    course.startingPriceAmount === undefined
  ) {
    return '可预约试听';
  }
  return detail?.businessModel.onlinePackageSalesEnabled
    ? `${money(course.startingPriceAmount)} 起`
    : `${money(course.startingPriceAmount)} 参考`;
}

export function InstitutionDetailPage() {
  const { institutionId = '' } = useParams();
  const [detail, setDetail] = useState<PublicInstitutionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!institutionId) return;
    setLoading(true);
    fetchPublicInstitution(institutionId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [institutionId]);

  useSeo({
    title: detail?.institution.name || '教学机构',
    description: detail?.institution.intro,
  });

  if (loading) {
    return (
      <Layout>
        <div className="container-narrow py-10">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mt-5 h-10 w-1/2" />
          <div className="skeleton mt-8 h-48 w-full" />
        </div>
      </Layout>
    );
  }

  if (!detail) {
    return (
      <Layout>
        <div className="container-narrow py-16 text-center">
          <p className="text-ink-soft text-sm">机构不存在或暂未公开。</p>
          <Link to="/about" className="pwbtn pwbtn-outline mt-4">
            返回关于我们
          </Link>
        </div>
      </Layout>
    );
  }

  const { institution, teachers, courses } = detail;
  const qualificationItems = institution.qualificationItems ?? [];
  const outcomeItems = institution.outcomeItems ?? [];

  return (
    <Layout>
      <section className="container-narrow py-10">
        <Link to="/about" className="text-muted hover:text-ink inline-flex items-center text-sm">
          <ArrowLeft className="h-4 w-4" />
          关于我们
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <main className="min-w-0 space-y-8">
            <header>
              <div className="flex items-center gap-4">
                {institution.logoUrl ? (
                  <img
                    src={institution.logoUrl}
                    alt={institution.name}
                    loading="lazy"
                    decoding="async"
                    className="border-line h-16 w-16 rounded-lg border object-contain p-2"
                  />
                ) : (
                  <div className="bg-brand-soft text-brand flex h-16 w-16 items-center justify-center rounded-lg">
                    <Building2 className="h-7 w-7" />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="section-title">{institution.name}</h1>
                </div>
              </div>
              <p className="text-ink-soft mt-5 max-w-3xl text-sm leading-7 whitespace-pre-line">
                {institution.intro || '机构介绍待补充。'}
              </p>
            </header>

            <MediaSection title="资质证明" items={qualificationItems} emptyText="资质证明待补充" />
            <MediaSection title="教学成果" items={outcomeItems} emptyText="教学成果待补充" />

            {teachers.length > 0 ? (
              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <h2 className="text-ink text-xl font-semibold">教师团队</h2>
                  <Link
                    to="/teachers"
                    className="text-brand inline-flex items-center gap-1 text-sm"
                  >
                    查看全部
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {teachers.map((teacher) => (
                    <TeacherCard key={teacher.id} teacher={teacher} />
                  ))}
                </div>
              </section>
            ) : null}

            {courses.length > 0 ? (
              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <h2 className="text-ink text-xl font-semibold">课程</h2>
                  <Link to="/courses" className="text-brand inline-flex items-center gap-1 text-sm">
                    查看全部
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {courses.map((course) => (
                    <Link
                      key={course.id}
                      to={`/courses/${course.slug}`}
                      className="pwcard pwcard-hover flex flex-col overflow-hidden no-underline"
                    >
                      {course.coverThumbUrl || course.coverImageUrl ? (
                        <div className="bg-brand-soft aspect-[16/9] overflow-hidden">
                          <img
                            src={course.coverThumbUrl || course.coverImageUrl || ''}
                            alt={course.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="p-5">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="chip">{course.category}</span>
                          <span className="chip">{course.ageRange}</span>
                        </div>
                        <h3 className="text-ink mt-3 text-base font-semibold">{course.name}</h3>
                        <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-6">
                          {course.summary}
                        </p>
                        <div className="border-line mt-4 flex items-center justify-between border-t pt-3">
                          <span className="text-muted text-xs">{course.durationMinutes} 分钟</span>
                          <span className="text-ink text-sm font-semibold">
                            {coursePriceLabel(course, detail)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </main>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="pwcard p-5">
              <h2 className="text-ink text-base font-semibold">联系方式</h2>
              <div className="text-ink-soft mt-4 space-y-3 text-sm leading-6">
                {institution.contact ? (
                  <div className="flex gap-2">
                    <Phone className="text-brand mt-0.5 h-4 w-4 shrink-0" />
                    <span className="whitespace-pre-line">{institution.contact}</span>
                  </div>
                ) : (
                  <span className="text-muted">联系方式待补充</span>
                )}
              </div>
            </section>
            <Link to="/register" className="pwbtn pwbtn-primary w-full">
              预约试听
            </Link>
          </aside>
        </div>
      </section>
    </Layout>
  );
}

function MediaSection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: InstitutionMediaItem[];
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="text-ink text-xl font-semibold">{title}</h2>
      {items.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {items.map((item, index) => (
            <figure key={`${item.imageUrl}-${index}`} className="pwcard overflow-hidden">
              <div className="bg-brand-soft aspect-[4/3] overflow-hidden">
                <img
                  src={item.imageUrl}
                  alt={item.caption || title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
              {item.caption ? (
                <figcaption className="text-ink-soft p-4 text-sm leading-6">
                  {item.caption}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : (
        <div className="pwcard text-muted mt-4 p-5 text-sm">{emptyText}</div>
      )}
    </section>
  );
}

function TeacherCard({ teacher }: { teacher: PublicTeacher }) {
  return (
    <Link
      to={`/teachers/${teacher.id}`}
      className="pwcard pwcard-hover flex items-center gap-4 p-4 no-underline"
    >
      {teacher.avatarUrl ? (
        <img
          src={teacher.avatarUrl}
          alt={teacher.name}
          loading="lazy"
          decoding="async"
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="bg-brand-soft text-brand flex h-16 w-16 shrink-0 items-center justify-center rounded-lg">
          <GraduationCap className="h-7 w-7" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-ink text-base font-semibold">{teacher.name}</div>
        <div className="text-muted mt-1 text-sm">{teacher.title || '教师'}</div>
        {teacher.tagline ? (
          <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-6">{teacher.tagline}</p>
        ) : null}
      </div>
    </Link>
  );
}
