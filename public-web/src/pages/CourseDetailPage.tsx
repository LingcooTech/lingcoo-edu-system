import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, ChevronLeft, Clock, MapPin, UserRound } from 'lucide-react';

import {
  fetchCourse,
  type BusinessModelSettings,
  type Course,
  type CoursePackage,
  type PublicCampus,
  type PublicInstitution,
  type PublicTeacher,
  type StudentWork,
} from '@/api/client';
import { BlockRenderer } from '@/components/blocks/BlockRenderer';
import { parseBlocks } from '@/components/blocks/blocks';
import { CheckoutModal, type CheckoutTarget } from '@/components/CheckoutModal';
import { Layout } from '@/components/Layout';
import { RichTextRenderer } from '@/components/RichTextRenderer';
import { TrialRegistrationModal } from '@/components/TrialRegistrationModal';
import { useSeo } from '@/lib/seo';
import { money } from '@/lib/utils';

function packagePriceAmount(pkg: CoursePackage) {
  return pkg.discountPriceAmount ?? pkg.priceAmount;
}

function packageLessonCount(pkg: CoursePackage) {
  return pkg.lessonCount + (pkg.giftedLessonCount ?? 0);
}

function packageLessonLabel(pkg: CoursePackage) {
  return pkg.giftedLessonCount
    ? `${pkg.lessonCount} 课时 + 赠 ${pkg.giftedLessonCount} 课时`
    : `${pkg.lessonCount} 课时`;
}

function mergeNotice(trialDescription?: string, reservationNotice?: string) {
  const parts = [trialDescription, reservationNotice]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(parts)).join('\n\n');
}

function workFrameClass(frameStyle?: string) {
  if (frameStyle === 'classic') {
    return 'rounded-xl border-[10px] border-white bg-white shadow-inner ring-1 ring-black/5';
  }
  if (frameStyle === 'paper') {
    return '-rotate-1 rounded-lg border-[10px] border-[#fbfaf7] bg-white shadow-sm';
  }
  return 'rounded-xl border-[14px] border-[#eee5da] bg-white shadow-inner ring-4 ring-white';
}

export function CourseDetailPage() {
  const { slug = '' } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [packages, setPackages] = useState<CoursePackage[]>([]);
  const [businessModel, setBusinessModel] = useState<BusinessModelSettings | null>(null);
  const [providerInstitution, setProviderInstitution] = useState<PublicInstitution | null>(null);
  const [defaultTeacher, setDefaultTeacher] = useState<PublicTeacher | null>(null);
  const [defaultTeachers, setDefaultTeachers] = useState<PublicTeacher[]>([]);
  const [campus, setCampus] = useState<PublicCampus | null>(null);
  const [campuses, setCampuses] = useState<PublicCampus[]>([]);
  const [studentWorks, setStudentWorks] = useState<StudentWork[]>([]);
  const [paymentReceiverInstitution, setPaymentReceiverInstitution] =
    useState<PublicInstitution | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);
  const [trialOpen, setTrialOpen] = useState(false);

  const contentIsBlockDoc = useMemo(() => {
    const trimmed = course?.content?.trim() ?? '';
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }, [course]);
  const contentBlocks = useMemo(
    () => (contentIsBlockDoc ? parseBlocks(course?.content) : []),
    [contentIsBlockDoc, course],
  );

  useSeo({
    title: course?.name || '课程详情',
    description: course?.summary,
  });

  useEffect(() => {
    setStatus('loading');
    fetchCourse(slug)
      .then((payload) => {
        setCourse(payload.course);
        setPackages(payload.coursePackages);
        setBusinessModel(payload.businessModel);
        setProviderInstitution(payload.providerInstitution ?? null);
        setDefaultTeacher(payload.defaultTeacher ?? null);
        setDefaultTeachers(
          payload.defaultTeachers?.length
            ? payload.defaultTeachers
            : payload.defaultTeacher
              ? [payload.defaultTeacher]
              : [],
        );
        setCampus(payload.campus ?? null);
        setCampuses(
          payload.campuses?.length ? payload.campuses : payload.campus ? [payload.campus] : [],
        );
        setStudentWorks(payload.studentWorks ?? []);
        setPaymentReceiverInstitution(payload.paymentReceiverInstitution ?? null);
        setStatus('ready');
      })
      .catch(() => setStatus('notfound'));
  }, [slug]);

  if (status === 'loading') {
    return (
      <Layout>
        <CourseDetailSkeleton />
      </Layout>
    );
  }

  if (status === 'notfound' || !course) {
    return (
      <Layout>
        <div className="container-narrow py-16 text-center">
          <p className="text-ink-soft text-sm">课程不存在或已下架。</p>
          <Link to="/courses" className="pwbtn pwbtn-outline mt-4">
            查看全部课程
          </Link>
        </div>
      </Layout>
    );
  }

  const onlinePackageSalesAllowed =
    Boolean(businessModel?.onlinePackageSalesEnabled) && course.onlineSalesEnabled !== false;
  const teacherLabel =
    defaultTeachers.length > 0
      ? defaultTeachers.map((teacher) => teacher.name).join(' / ')
      : defaultTeacher?.name || '场次确认';
  const campusOptions = course ? (campuses.length ? campuses : campus ? [campus] : []) : [];
  const campusLabel =
    campusOptions.length > 0 ? campusOptions.map((item) => item.name).join(' / ') : '到店确认';
  const paymentReceiverLabel =
    paymentReceiverInstitution?.name ||
    course.paymentReceiverName ||
    (course.paymentReceiverType === 'provider'
      ? providerInstitution?.name
      : course.paymentReceiverType === 'platform'
        ? '平台'
        : '');
  const trialNotice = mergeNotice(course.trialDescription, course.reservationNotice);
  const trialNoticeItems = (trialNotice || '免注册预约，老师电话确认上课时间')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <Layout>
      <div className="container-narrow py-8">
        <Link to="/courses" className="text-muted hover:text-ink inline-flex items-center text-sm">
          <ChevronLeft className="h-4 w-4" />
          全部课程
        </Link>

        <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="min-w-0">
            {course.coverImageUrl ? (
              <div className="bg-brand-soft mb-4 aspect-[16/10] overflow-hidden rounded-2xl shadow-sm md:hidden">
                <img
                  src={course.coverImageUrl}
                  alt={course.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            <div className="bg-surface rounded-2xl p-4 shadow-sm ring-1 ring-black/5 md:bg-transparent md:p-0 md:shadow-none md:ring-0">
              <div className="flex flex-wrap gap-2">
                <span className="chip">{course.category}</span>
                <span className="chip">{course.ageRange}</span>
              </div>
              <h1 className="text-ink mt-3 text-2xl leading-tight font-bold tracking-tight md:text-3xl">
                {course.name}
              </h1>
              <p className="text-ink-soft mt-3 max-w-2xl text-base leading-7">{course.summary}</p>

              <div className="mobile-detail-cta">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="mobile-detail-cta-price">预约试听</div>
                  </div>
                  <div className="text-muted text-right text-xs">
                    {course.durationMinutes} 分钟/节
                  </div>
                </div>
                <button
                  type="button"
                  className="pwbtn pwbtn-primary mt-4 w-full"
                  onClick={() => setTrialOpen(true)}
                >
                  立即预约
                </button>
              </div>
            </div>

            {course.coverImageUrl ? (
              <div className="bg-brand-soft mt-6 hidden aspect-[16/9] overflow-hidden rounded-2xl md:block">
                <img
                  src={course.coverImageUrl}
                  alt={course.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            <section className="pwcard mt-6 grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
              <div className="text-ink-soft flex items-center gap-2">
                <Clock className="text-brand h-4 w-4 shrink-0" />
                <span>单节 {course.durationMinutes} 分钟</span>
              </div>
              <div className="text-ink-soft flex items-center gap-2">
                <Building2 className="text-brand h-4 w-4 shrink-0" />
                <span>课程提供方：{providerInstitution?.name ?? '平台自有 / 待确认'}</span>
              </div>
              <div className="text-ink-soft flex items-center gap-2">
                <UserRound className="text-brand h-4 w-4 shrink-0" />
                <span>授课老师：{teacherLabel}</span>
              </div>
              {paymentReceiverLabel && (
                <div className="text-ink-soft flex items-center gap-2">
                  <Building2 className="text-brand h-4 w-4 shrink-0" />
                  <span>收款方：{paymentReceiverLabel}</span>
                </div>
              )}
              <div className="text-ink-soft flex items-start gap-2 sm:col-span-2">
                <MapPin className="text-brand mt-0.5 h-4 w-4 shrink-0" />
                <span>授课校区：{campusLabel}</span>
              </div>
            </section>

            {contentIsBlockDoc && contentBlocks.length > 0 && (
              <div className="mt-8">
                <BlockRenderer blocks={contentBlocks} />
              </div>
            )}
            {!contentIsBlockDoc && course.content?.trim() ? (
              <div className="mt-8">
                <RichTextRenderer content={course.content} />
              </div>
            ) : null}

            {studentWorks.length > 0 ? (
              <section className="mt-8">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-ink text-xl font-semibold">学员作品</h2>
                    <p className="text-muted mt-1 text-sm">来自活动现场与阶段成果展示</p>
                  </div>
                </div>
                <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                  {studentWorks.map((work) => (
                    <article key={work.id} className="pwcard w-64 shrink-0 overflow-hidden p-3">
                      <div className={workFrameClass(work.frameStyle)}>
                        <img
                          src={work.imageUrls[0]}
                          alt={work.title}
                          loading="lazy"
                          decoding="async"
                          className="h-56 w-full rounded-lg object-cover"
                        />
                      </div>
                      <div className="px-1 pt-3">
                        <div className="text-ink line-clamp-1 text-sm font-semibold">
                          {work.title || '作品展示'}
                        </div>
                        <div className="text-muted mt-1 text-xs">
                          {work.student?.name || '学员作品'}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </article>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {packages.length > 0 && (
              <section id="packages" className="pwcard scroll-mt-24 p-5 sm:p-6">
                <h2 className="text-ink text-base font-semibold">课时包</h2>
                <div className="mt-5 space-y-5">
                  {packages.map((pkg) => (
                    <div key={pkg.id}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-ink text-base leading-6 font-semibold">
                            {pkg.name}
                          </div>
                          <div className="text-muted mt-1 text-xs">{packageLessonLabel(pkg)}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-ink text-base font-semibold">
                            {money(packagePriceAmount(pkg))}
                          </div>
                          {pkg.discountPriceAmount !== null &&
                          pkg.discountPriceAmount !== undefined ? (
                            <div className="text-muted mt-1 text-xs line-through">
                              {money(pkg.priceAmount)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {pkg.description ? (
                        <p className="text-ink-soft mt-3 text-sm leading-6">{pkg.description}</p>
                      ) : null}
                      {onlinePackageSalesAllowed ? (
                        <button
                          type="button"
                          className="pwbtn pwbtn-primary mt-5 w-full"
                          onClick={() =>
                            setCheckoutTarget({
                              type: 'package',
                              packageId: pkg.id,
                              courseId: course.id,
                              title: pkg.name,
                              subtitle: `${packageLessonLabel(pkg)} · ${course.name}`,
                              description: pkg.description,
                              amount: packagePriceAmount(pkg),
                              lessonCount: packageLessonCount(pkg),
                            })
                          }
                        >
                          购买课时包
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="pwcard p-5 sm:p-6 lg:block">
              <div className="text-ink text-base font-semibold">预约试听</div>
              <button
                type="button"
                className="pwbtn pwbtn-primary mt-5 w-full"
                onClick={() => setTrialOpen(true)}
              >
                立即预约
              </button>
              <ul className="border-line text-ink-soft mt-5 list-disc space-y-1 border-t pt-4 pl-5 text-xs leading-6">
                {trialNoticeItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      <CheckoutModal
        open={Boolean(checkoutTarget)}
        target={checkoutTarget}
        onClose={() => setCheckoutTarget(null)}
      />
      <TrialRegistrationModal
        open={trialOpen}
        course={course}
        campuses={campusOptions}
        teachers={defaultTeachers}
        onClose={() => setTrialOpen(false)}
      />
    </Layout>
  );
}

function CourseDetailSkeleton() {
  return (
    <div className="container-narrow py-8">
      <div className="skeleton h-4 w-20" />
      <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="flex gap-2">
            <div className="skeleton h-5 w-16" />
            <div className="skeleton h-5 w-16" />
          </div>
          <div className="skeleton mt-3 h-9 w-3/4" />
          <div className="skeleton mt-4 h-4 w-full" />
          <div className="skeleton mt-2 h-4 w-5/6" />
          <div className="skeleton mt-6 h-28 w-full" />
          <div className="skeleton mt-8 h-40 w-full" />
        </div>
        <div className="hidden lg:block">
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
