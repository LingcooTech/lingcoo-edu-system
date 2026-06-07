import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, ChevronLeft, Clock, Layers, MapPin, UserRound } from 'lucide-react';

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
import { Layout } from '@/components/Layout';
import { money } from '@/lib/utils';

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
            {packages.length > 0 ? `${packages.length} 个课时包` : '暂未上架课时包'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            单节 {course.durationMinutes} 分钟
          </span>
        </div>

        <section className="border-line bg-surface mt-5 grid gap-3 rounded-2xl border p-4 text-sm sm:grid-cols-2">
          <div className="text-ink-soft flex items-center gap-2">
            <Building2 className="text-brand h-4 w-4" />
            <span>课程提供方：{providerInstitution?.name ?? '平台自有 / 待确认'}</span>
          </div>
          <div className="text-ink-soft flex items-center gap-2">
            <UserRound className="text-brand h-4 w-4" />
            <span>授课老师：{defaultTeacher?.name ?? '场次确认'}</span>
          </div>
          <div className="text-ink-soft flex items-center gap-2">
            <MapPin className="text-brand h-4 w-4" />
            <span>授课地点：{course.teachingLocationLabel || '到店确认'}</span>
          </div>
          {paymentReceiverLabel && (
            <div className="text-ink-soft flex items-center gap-2">
              <Building2 className="text-brand h-4 w-4" />
              <span>收款方：{paymentReceiverLabel}</span>
            </div>
          )}
        </section>

        {contentBlocks.length > 0 && (
          <div className="mt-6">
            <BlockRenderer blocks={contentBlocks} />
          </div>
        )}

        {packages.length > 0 && (
          <section className="mt-8">
            <h2 className="text-ink text-base font-semibold">
              {onlinePackageSalesAllowed ? '课时包' : '正式课程参考方案'}
            </h2>
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
                  {onlinePackageSalesAllowed ? (
                    <Link to={`/checkout/${pkg.id}`} className="pwbtn pwbtn-outline mt-3 w-full">
                      购买课时包
                    </Link>
                  ) : (
                    <Link
                      to={`/register?course=${course.slug}`}
                      className="pwbtn pwbtn-outline mt-3 w-full"
                    >
                      预约试听后到店确认
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {(course.trialDescription || course.reservationNotice) && (
          <section className="mt-8 space-y-3">
            {course.trialDescription && (
              <div className="pwcard p-4">
                <h2 className="text-ink text-base font-semibold">试听说明</h2>
                <p className="text-ink-soft mt-2 text-sm leading-6 whitespace-pre-wrap">
                  {course.trialDescription}
                </p>
              </div>
            )}
            {course.reservationNotice && (
              <div className="pwcard p-4">
                <h2 className="text-ink text-base font-semibold">预约规则</h2>
                <p className="text-ink-soft mt-2 text-sm leading-6 whitespace-pre-wrap">
                  {course.reservationNotice}
                </p>
              </div>
            )}
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
