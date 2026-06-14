import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Building2, Landmark, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  fetchPublicInstitutions,
  loadHome,
  type HomePayload,
  type PublicInstitution,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { BlockRenderer } from '@/components/blocks/BlockRenderer';
import { useSeo } from '@/lib/seo';

export function AboutPage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [institutions, setInstitutions] = useState<PublicInstitution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([loadHome(), fetchPublicInstitutions()])
      .then(([homeResult, institutionsResult]) => {
        if (homeResult.status === 'fulfilled') {
          setHome(homeResult.value);
        }
        if (institutionsResult.status === 'fulfilled') {
          setInstitutions(institutionsResult.value);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const organization = home?.organization;
  const about = organization?.publicSite?.aboutPage;
  const blocks = about?.bodyBlocks ?? [];
  const title = about?.title || '关于我们';
  const subtitle = about?.subtitle ?? '了解预约平台、教学机构和到店咨询方式。';
  const platformTitle = platformTitleFor(organization?.brandName, about?.operatorIntroTitle);
  const teachingTitle =
    about?.brandCooperationTitle && about.brandCooperationTitle !== '品牌合作'
      ? about.brandCooperationTitle
      : '教学机构';

  useSeo({
    title: about?.seoTitle || title,
    description: subtitle,
    brandName: organization?.brandName,
  });

  if (loading) {
    return (
      <Layout>
        <main className="px-5 py-10 text-center text-sm text-slate-500">加载中...</main>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div>
          <h1 className="section-title">{title}</h1>
          {subtitle ? (
            <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">{subtitle}</p>
          ) : null}
        </div>

        {about?.heroImageUrl ? (
          <div className="border-line bg-brand-soft mt-7 aspect-[21/8] overflow-hidden rounded-lg border">
            <img
              src={about.heroImageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5">
            <InfoSection
              icon={<Landmark className="h-5 w-5" />}
              title={platformTitle}
              content={about?.operatorIntro}
              fallback={platformIntroFallbackFor(organization?.brandName)}
            />

            <InfoSection
              icon={<Building2 className="h-5 w-5" />}
              title={teachingTitle}
              content={about?.brandCooperation}
              fallback="教学机构负责课程研发、师资安排、课堂交付与课后反馈。家长可结合课程详情、教师团队和成长故事，判断课程是否适合孩子当前阶段。"
            >
              {institutions.length > 0 ? (
                <div className="border-line mt-5 divide-y border-t">
                  {institutions.map((institution) => (
                    <Link
                      key={institution.id}
                      to={`/institutions/${institution.id}`}
                      className="group block py-4 no-underline first:pt-5 last:pb-0"
                    >
                      <div className="flex items-start gap-3">
                        {institution.logoUrl ? (
                          <img
                            src={institution.logoUrl}
                            alt={institution.name}
                            loading="lazy"
                            decoding="async"
                            className="border-line h-11 w-11 shrink-0 rounded-lg border object-contain p-1"
                          />
                        ) : (
                          <div className="bg-brand-soft text-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
                            <Building2 className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <h3 className="text-ink text-sm font-semibold">{institution.name}</h3>
                            <ArrowRight className="text-muted group-hover:text-brand h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                          </div>
                          {institution.intro ? (
                            <p className="text-ink-soft mt-1 text-sm leading-6 whitespace-pre-line">
                              {institution.intro}
                            </p>
                          ) : null}
                          {institution.contact ? (
                            <p className="text-muted mt-2 text-xs leading-5 whitespace-pre-line">
                              {institution.contact}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </InfoSection>

            {blocks.length > 0 ? <BlockRenderer blocks={blocks} /> : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <ContactPanel
              title="平台联系方式"
              name={organization?.brandName || organization?.name || '预约平台'}
              phone={organization?.phone}
              address={organization?.address}
            />

            {institutions.length > 0 ? (
              <section className="pwcard p-5">
                <h2 className="text-ink text-base font-semibold">教学机构联系方式</h2>
                <div className="border-line mt-4 divide-y border-t">
                  {institutions.map((institution) => (
                    <div key={institution.id} className="py-4 first:pt-5 last:pb-0">
                      <div className="text-ink text-sm font-semibold">{institution.name}</div>
                      <p className="text-muted mt-2 text-xs leading-5 whitespace-pre-line">
                        {institution.contact || '联系方式待补充'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </section>
    </Layout>
  );
}

function platformTitleFor(brandName?: string, configuredTitle?: string) {
  const raw = configuredTitle?.trim();
  const legacyDefaults = new Set(['运营方介绍', '预约平台', '美智成长空间预约平台']);
  if (raw && !legacyDefaults.has(raw)) {
    return raw;
  }

  const brand = brandName?.trim();
  if (!brand) {
    return '预约平台';
  }
  return brand.endsWith('平台') ? brand : `${brand}预约平台`;
}

function platformIntroFallbackFor(brandName?: string) {
  const brand = brandName?.trim();
  const subject = brand ? (brand.endsWith('平台') ? brand : `${brand}预约平台`) : '预约平台';
  return `${subject}负责线上课程展示、试听预约、线索留存与家长沟通入口，帮助家长更清楚地了解课程安排，并把预约信息准确同步给教学机构。`;
}

function InfoSection({
  icon,
  title,
  content,
  fallback,
  children,
}: {
  icon: ReactNode;
  title: string;
  content?: string;
  fallback: string;
  children?: ReactNode;
}) {
  return (
    <article className="pwcard p-6">
      <div className="flex items-start gap-3">
        <div className="bg-brand-soft text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-ink text-xl font-semibold">{title}</h2>
          <p className="text-ink-soft mt-3 text-sm leading-7 whitespace-pre-line">
            {content?.trim() || fallback}
          </p>
        </div>
      </div>
      {children}
    </article>
  );
}

function ContactPanel({
  title,
  name,
  phone,
  address,
}: {
  title: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}) {
  return (
    <section className="pwcard p-5">
      <h2 className="text-ink text-base font-semibold">{title}</h2>
      <div className="text-ink mt-3 text-sm font-medium">{name}</div>
      <div className="text-ink-soft mt-4 space-y-3 text-sm leading-6">
        {phone ? (
          <div className="flex gap-2">
            <Phone className="text-brand mt-0.5 h-4 w-4 shrink-0" />
            <span>{phone}</span>
          </div>
        ) : null}
        {address ? (
          <div className="flex gap-2">
            <MapPin className="text-brand mt-0.5 h-4 w-4 shrink-0" />
            <span>{address}</span>
          </div>
        ) : null}
        {!phone && !address ? <span className="text-muted">联系方式待补充</span> : null}
      </div>
    </section>
  );
}
