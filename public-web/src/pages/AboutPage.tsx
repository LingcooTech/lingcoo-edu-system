import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Handshake, Landmark, MapPin, Phone } from 'lucide-react';

import { loadHome, type HomePayload } from '@/api/client';
import { Layout } from '@/components/Layout';
import { BlockRenderer } from '@/components/blocks/BlockRenderer';

export function AboutPage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Layout>
        <main className="px-5 py-10 text-center text-sm text-slate-500">加载中...</main>
      </Layout>
    );
  }

  const organization = home?.organization;
  const about = organization?.publicSite?.aboutPage;
  const blocks = about?.bodyBlocks ?? [];

  return (
    <Layout>
      <section className="border-line bg-surface border-b">
        <div className="container-narrow py-10 md:py-14">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="eyebrow">{organization?.brandName ?? 'About'}</div>
              <h1 className="text-ink mt-4 text-4xl leading-tight font-bold tracking-tight">
                {about?.title ?? '关于我们'}
              </h1>
              <p className="text-ink-soft mt-5 text-base leading-8">
                {about?.subtitle ?? '介绍运营方、品牌合作与长期服务能力。'}
              </p>
            </div>
            {about?.heroImageUrl ? (
              <div className="hero-media">
                <img
                  src={about.heroImageUrl}
                  alt={about.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="pwcard p-6">
                <div className="text-ink text-sm font-semibold">{organization?.brandName}</div>
                <div className="text-ink-soft mt-4 space-y-3 text-sm leading-7">
                  {organization?.address ? (
                    <div className="flex gap-2">
                      <MapPin className="text-brand mt-0.5 h-4 w-4 shrink-0" />
                      <span>{organization.address}</span>
                    </div>
                  ) : null}
                  {organization?.phone ? (
                    <div className="flex gap-2">
                      <Phone className="text-brand mt-0.5 h-4 w-4 shrink-0" />
                      <span>{organization.phone}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="container-narrow py-10">
        <div className="grid gap-5 lg:grid-cols-2">
          <InfoPanel
            icon={<Landmark className="h-5 w-5" />}
            title="运营方介绍"
            content={about?.operatorIntro}
          />
          <InfoPanel
            icon={<Handshake className="h-5 w-5" />}
            title="品牌合作"
            content={about?.brandCooperation}
          />
        </div>
      </section>

      {blocks.length > 0 ? (
        <section className="container-narrow pb-12">
          <BlockRenderer blocks={blocks} />
        </section>
      ) : null}
    </Layout>
  );
}

function InfoPanel({ icon, title, content }: { icon: ReactNode; title: string; content?: string }) {
  if (!content?.trim()) return null;

  return (
    <article className="pwcard p-6">
      <div className="bg-brand-soft text-brand flex h-10 w-10 items-center justify-center rounded-2xl">
        {icon}
      </div>
      <h2 className="text-ink mt-5 text-xl font-semibold">{title}</h2>
      <p className="text-ink-soft mt-3 text-sm leading-7 whitespace-pre-line">{content}</p>
    </article>
  );
}
