import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, ChevronLeft, Clock, MapPin, ShieldCheck, UserRound } from 'lucide-react';

import {
  fetchCourse,
  type BusinessModelSettings,
  type Course,
  type CoursePackage,
  type PublicInstitution,
  type PublicTeacher,
} from '@/api/client';
import { BlockRenderer } from '@/components/blocks/BlockRenderer';
import { parseBlocks } from '@/components/blocks/blocks';
import { CheckoutModal, type CheckoutTarget } from '@/components/CheckoutModal';
import { Layout } from '@/components/Layout';
import { money } from '@/lib/utils';

function priceHeadline(
  packages: CoursePackage[],
  onlineAllowed: boolean,
): { big: string; sub: string } {
  if (onlineAllowed && packages.length > 0) {
    const min = Math.min(...packages.map((pkg) => pkg.priceAmount));
    return { big: `${money(min)} 起`, sub: `共 ${packages.length} 个课时包` };
  }
  return { big: '可预约试听', sub: '免注册 · 老师电话确认时间' };
}

export function CourseDetailPage() {
  const { slug = '' } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [packages, setPackages] = useState<CoursePackage[]>([]);
  const [businessModel, setBusinessModel] = useState<BusinessModelSettings | null>(null);
  const [providerInstitution, setProviderInstitution] = useState<PublicInstitution | null>(null);
  const [defaultTeacher, setDefaultTeacher] = useState<PublicTeacher | null>(null);
  const [paymentReceiverInstitution, setPaymentReceiverInstitution] =
    useState<PublicInstitution | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  const contentBlocks = useMemo(() => parseBlocks(course?.content), [course]);

  useEffect(() => {
    setStatus('loading');
    fetchCourse(slug)
      .then((payload) => {
        setCourse(payload.course);
        setPackages(payload.coursePackages);
        setBusinessModel(payload.businessModel);
        setProviderInstitution(payload.providerInstitution ?? null);
        setDefaultTeacher(payload.defaultTeacher ?? null);
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
  const paymentReceiverLabel =
    course.paymentReceiverName ||
    paymentReceiverInstitution?.name ||
    (course.paymentReceiverType === 'provider'
      ? providerInstitution?.name
      : course.paymentReceiverType === 'platform'
        ? '平台'
        : '');
  const price = priceHeadline(packages, onlinePackageSalesAllowed);
  const registerHref = `/register?course=${course.slug}`;

  return (
    <Layout>
      <div className="container-narrow py-8">
        <Link to="/courses" className="text-muted hover:text-ink inline-flex items-center text-sm">
          <ChevronLeft className="h-4 w-4" />
          全部课程
        </Link>

        <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="chip">{course.category}</span>
              <span className="chip">{course.ageRange}</span>
            </div>
            <h1 className="text-ink mt-3 text-3xl font-bold tracking-tight">{course.name}</h1>
            <p className="text-ink-soft mt-3 max-w-2xl text-base leading-7">{course.summary}</p>

            {course.coverImageUrl ? (
              <div className="bg-brand-soft mt-6 aspect-[16/9] overflow-hidden rounded-2xl">
                <img
                  src={course.coverImageUrl}
                  alt={course.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            <div className="text-ink-soft mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="text-brand h-4 w-4" />
                单节 {course.durationMinutes} 分钟
              </span>
            </div>

            <section className="pwcard mt-6 grid gap-3 p-5 text-sm sm:grid-cols-2">
              <div className="text-ink-soft flex items-center gap-2">
                <Building2 className="text-brand h-4 w-4 shrink-0" />
                <span>课程提供方：{providerInstitution?.name ?? '平台自有 / 待确认'}</span>
              </div>
              <div className="text-ink-soft flex items-center gap-2">
                <UserRound className="text-brand h-4 w-4 shrink-0" />
                <span>授课老师：{defaultTeacher?.name ?? '场次确认'}</span>
              </div>
              <div className="text-ink-soft flex items-center gap-2">
                <MapPin className="text-brand h-4 w-4 shrink-0" />
                <span>授课地点：{course.teachingLocationLabel || '到店确认'}</span>
              </div>
              {paymentReceiverLabel && (
                <div className="text-ink-soft flex items-center gap-2">
                  <Building2 className="text-brand h-4 w-4 shrink-0" />
                  <span>收款方：{paymentReceiverLabel}</span>
                </div>
              )}
            </section>

            {contentBlocks.length > 0 && (
              <div className="mt-8">
                <BlockRenderer blocks={contentBlocks} />
              </div>
            )}

            {(course.trialDescription || course.reservationNotice) && (
              <section className="mt-10 space-y-3">
                {course.trialDescription && (
                  <div className="pwcard p-5">
                    <h2 className="text-ink text-base font-semibold">试听说明</h2>
                    <p className="text-ink-soft mt-2 max-w-2xl text-sm leading-6 whitespace-pre-wrap">
                      {course.trialDescription}
                    </p>
                  </div>
                )}
                {course.reservationNotice && (
                  <div className="pwcard p-5">
                    <h2 className="text-ink text-base font-semibold">预约规则</h2>
                    <p className="text-ink-soft mt-2 max-w-2xl text-sm leading-6 whitespace-pre-wrap">
                      {course.reservationNotice}
                    </p>
                  </div>
                )}
              </section>
            )}
          </article>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="pwcard p-5">
              <div className="eyebrow">预约</div>
              <div className="text-ink mt-2 text-2xl font-bold">{price.big}</div>
              <div className="text-muted mt-1 text-xs">{price.sub}</div>
              <Link to={registerHref} className="pwbtn pwbtn-primary mt-5 w-full">
                预约试听 / 留资
              </Link>
              {onlinePackageSalesAllowed && packages.length > 0 && (
                <a href="#packages" className="pwbtn pwbtn-outline mt-2 w-full">
                  查看课时包
                </a>
              )}
              <div className="border-line text-ink-soft mt-5 space-y-2 border-t pt-4 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-brand h-4 w-4 shrink-0" />
                  免注册预约，老师电话确认上课时间
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="text-brand h-4 w-4 shrink-0" />
                  单节 {course.durationMinutes} 分钟
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="text-brand h-4 w-4 shrink-0" />
                  {course.teachingLocationLabel || '到店确认'}
                </div>
              </div>
            </div>

            {packages.length > 0 && (
              <section id="packages" className="pwcard scroll-mt-24 p-5">
                <h2 className="text-ink text-base font-semibold">
                  {onlinePackageSalesAllowed ? '课时包' : '正式课程参考方案'}
                </h2>
                <div className="mt-4 space-y-4">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="border-line border-t pt-4 first:border-t-0 first:pt-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-ink text-sm font-semibold">{pkg.name}</div>
                          <div className="text-muted mt-1 text-xs">{pkg.lessonCount} 课时</div>
                        </div>
                        <div className="text-ink shrink-0 text-base font-semibold">
                          {money(pkg.priceAmount)}
                        </div>
                      </div>
                      {pkg.description ? (
                        <p className="text-ink-soft mt-2 text-sm leading-6">{pkg.description}</p>
                      ) : null}
                      {onlinePackageSalesAllowed ? (
                        <button
                          type="button"
                          className="pwbtn pwbtn-primary mt-4 w-full"
                          onClick={() =>
                            setCheckoutTarget({
                              type: 'package',
                              packageId: pkg.id,
                              title: pkg.name,
                              subtitle: `${pkg.lessonCount} 课时 · ${course.name}`,
                              description: pkg.description,
                              amount: pkg.priceAmount,
                              lessonCount: pkg.lessonCount,
                            })
                          }
                        >
                          购买课时包
                        </button>
                      ) : (
                        <Link to={registerHref} className="pwbtn pwbtn-outline mt-4 w-full">
                          预约试听后到店确认
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>

      {/* Mobile / tablet sticky CTA. */}
      <div className="border-line bg-surface/95 sticky bottom-0 z-20 border-t backdrop-blur lg:hidden">
        <div className="container-narrow flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-ink text-base leading-tight font-semibold">{price.big}</div>
            <div className="text-muted truncate text-xs">免注册 · 老师电话确认时间</div>
          </div>
          {onlinePackageSalesAllowed && packages.length > 0 ? (
            <a href="#packages" className="pwbtn pwbtn-primary shrink-0">
              查看课时包
            </a>
          ) : (
            <Link to={registerHref} className="pwbtn pwbtn-primary shrink-0">
              预约试听
            </Link>
          )}
        </div>
      </div>

      <CheckoutModal
        open={Boolean(checkoutTarget)}
        target={checkoutTarget}
        onClose={() => setCheckoutTarget(null)}
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
