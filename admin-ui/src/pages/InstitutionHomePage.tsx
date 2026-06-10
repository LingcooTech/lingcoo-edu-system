import { useEffect, useState, type ReactNode } from 'react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type { PublicProfile } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { Field } from '@/components/shared/FormField';
import { QiniuGalleryField } from '@/components/shared/QiniuImageField';
import { useToast } from '@/components/shared/Toast';

interface HomeForm {
  eyebrow: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImagesText: string;
  ctaText: string;
  ctaLink: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  statsText: string;
  highlightsText: string;
  testimonialsText: string;
  businessHours: string;
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function profileToForm(profile: PublicProfile): HomeForm {
  return {
    eyebrow: profile.eyebrow,
    bannerTitle: profile.bannerTitle,
    bannerSubtitle: profile.bannerSubtitle,
    bannerImagesText: (profile.bannerImages?.length
      ? profile.bannerImages
      : [profile.bannerImageUrl]
    )
      .filter(Boolean)
      .join('\n'),
    ctaText: profile.ctaText,
    ctaLink: profile.ctaLink,
    secondaryCtaText: profile.secondaryCtaText,
    secondaryCtaLink: profile.secondaryCtaLink,
    statsText: profile.stats.join('\n'),
    highlightsText: profile.highlights.join('\n'),
    testimonialsText: profile.testimonials.join('\n'),
    businessHours: profile.businessHours,
  };
}

export function InstitutionHomePage() {
  const toast = useToast();
  const [form, setForm] = useState<HomeForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrganization()
      .then((org) => {
        setForm(profileToForm(org.publicProfile));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'));
  }, [toast]);

  function update<K extends keyof HomeForm>(key: K, value: HomeForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form) return;
    const bannerImages = linesToList(form.bannerImagesText);
    setSaving(true);
    try {
      const updated = await saveOrganization({
        publicProfile: {
          eyebrow: form.eyebrow,
          bannerImages,
          bannerImageUrl: bannerImages[0] ?? '',
          bannerTitle: form.bannerTitle,
          bannerSubtitle: form.bannerSubtitle,
          ctaText: form.ctaText,
          ctaLink: form.ctaLink,
          secondaryCtaText: form.secondaryCtaText,
          secondaryCtaLink: form.secondaryCtaLink,
          stats: linesToList(form.statsText),
          highlights: linesToList(form.highlightsText),
          testimonials: linesToList(form.testimonialsText),
          businessHours: form.businessHours,
        },
      });
      setForm(profileToForm(updated.publicProfile));
      toast.success('机构主页已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      section="institutionHome"
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={!form || saving}
        >
          {saving ? '保存中...' : '保存主页'}
        </button>
      }
    >
      {!form ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : (
        <div className="max-w-5xl space-y-5">
          <EditorCard
            title="首屏定位与转化"
            description="对应首页首屏：定位、Slogan、机构介绍、轮播图、行动按钮和数据条。"
          >
            <Field label="定位" hint="例如：社区小班成长教室">
              <input
                className="form-input"
                value={form.eyebrow}
                onChange={(e) => update('eyebrow', e.target.value)}
              />
            </Field>
            <Field label="Slogan">
              <input
                className="form-input"
                value={form.bannerTitle}
                onChange={(e) => update('bannerTitle', e.target.value)}
              />
            </Field>
            <Field label="机构介绍">
              <textarea
                className="form-input h-20"
                value={form.bannerSubtitle}
                onChange={(e) => update('bannerSubtitle', e.target.value)}
              />
            </Field>
            <QiniuGalleryField
              label="首屏轮播图"
              hint="可上传或从素材库勾选多张图片"
              value={form.bannerImagesText}
              onChange={(value) => update('bannerImagesText', value)}
              prefix="homepage/banner"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="主按钮文字">
                <input
                  className="form-input"
                  value={form.ctaText}
                  onChange={(e) => update('ctaText', e.target.value)}
                />
              </Field>
              <Field label="主按钮链接" hint="如 /register">
                <input
                  className="form-input"
                  value={form.ctaLink}
                  onChange={(e) => update('ctaLink', e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="次按钮文字">
                <input
                  className="form-input"
                  value={form.secondaryCtaText}
                  onChange={(e) => update('secondaryCtaText', e.target.value)}
                />
              </Field>
              <Field label="次按钮链接" hint="如 /courses">
                <input
                  className="form-input"
                  value={form.secondaryCtaLink}
                  onChange={(e) => update('secondaryCtaLink', e.target.value)}
                />
              </Field>
            </div>
            <Field label="首屏数据" hint="每行一项，如「6-8 人小班」">
              <textarea
                className="form-input h-20"
                value={form.statsText}
                onChange={(e) => update('statsText', e.target.value)}
              />
            </Field>
          </EditorCard>

          <EditorCard title="核心优势" description="首页首屏下方的核心优势总结。">
            <Field label="核心优势总结" hint="每行一项，建议 3 条">
              <textarea
                className="form-input h-28"
                value={form.highlightsText}
                onChange={(e) => update('highlightsText', e.target.value)}
              />
            </Field>
          </EditorCard>

          <EditorCard title="家长评价" description="展示在首页评价模块。">
            <Field label="评价内容" hint="每行一条">
              <textarea
                className="form-input h-28"
                value={form.testimonialsText}
                onChange={(e) => update('testimonialsText', e.target.value)}
              />
            </Field>
          </EditorCard>

          <EditorCard title="联系与上课时间">
            <Field label="营业 / 上课时间">
              <input
                className="form-input"
                value={form.businessHours}
                onChange={(e) => update('businessHours', e.target.value)}
              />
            </Field>
          </EditorCard>
        </div>
      )}
    </PageFrame>
  );
}

function EditorCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-muted-foreground mt-0.5 text-xs">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
