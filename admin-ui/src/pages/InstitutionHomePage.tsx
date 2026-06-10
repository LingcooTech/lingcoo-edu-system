import { useEffect, useState, type ReactNode } from 'react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type { PublicProfile, PublicProfileHighlight, PublicProfileTestimonial } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { Field } from '@/components/shared/FormField';
import { QiniuGalleryField, QiniuImageField } from '@/components/shared/QiniuImageField';
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
  highlights: PublicProfileHighlight[];
  testimonials: PublicProfileTestimonial[];
  businessHours: string;
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanHighlights(items: PublicProfileHighlight[]): PublicProfileHighlight[] {
  return items
    .map((item) => ({
      text: item.text.trim(),
      imageUrl: item.imageUrl.trim(),
    }))
    .filter((item) => item.text);
}

function cleanTestimonials(items: PublicProfileTestimonial[]): PublicProfileTestimonial[] {
  return items
    .map((item) => ({
      name: item.name.trim(),
      avatarUrl: item.avatarUrl.trim(),
      content: item.content.trim(),
    }))
    .filter((item) => item.content);
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
    highlights: profile.highlights,
    testimonials: profile.testimonials,
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

  function updateHighlight(index: number, patch: Partial<PublicProfileHighlight>) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            highlights: prev.highlights.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ),
          }
        : prev,
    );
  }

  function addHighlight() {
    setForm((prev) =>
      prev ? { ...prev, highlights: [...prev.highlights, { text: '', imageUrl: '' }] } : prev,
    );
  }

  function removeHighlight(index: number) {
    setForm((prev) =>
      prev
        ? { ...prev, highlights: prev.highlights.filter((_, itemIndex) => itemIndex !== index) }
        : prev,
    );
  }

  function updateTestimonial(index: number, patch: Partial<PublicProfileTestimonial>) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            testimonials: prev.testimonials.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ),
          }
        : prev,
    );
  }

  function addTestimonial() {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            testimonials: [...prev.testimonials, { name: '', avatarUrl: '', content: '' }],
          }
        : prev,
    );
  }

  function removeTestimonial(index: number) {
    setForm((prev) =>
      prev
        ? { ...prev, testimonials: prev.testimonials.filter((_, itemIndex) => itemIndex !== index) }
        : prev,
    );
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
          highlights: cleanHighlights(form.highlights),
          testimonials: cleanTestimonials(form.testimonials),
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
        <button type="button" className="btn btn-primary" onClick={save} disabled={!form || saving}>
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
            <div className="space-y-4">
              {form.highlights.map((item, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">优势 {index + 1}</div>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => removeHighlight(index)}
                    >
                      删除
                    </button>
                  </div>
                  <Field label="优势文案">
                    <textarea
                      className="form-input h-20"
                      value={item.text}
                      onChange={(event) => updateHighlight(index, { text: event.target.value })}
                    />
                  </Field>
                  <QiniuImageField
                    label="背景图片"
                    hint="可选；前台优势卡片会用作背景图"
                    value={item.imageUrl}
                    onChange={(imageUrl) => updateHighlight(index, { imageUrl })}
                    prefix="homepage/highlights"
                  />
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={addHighlight}>
                添加优势
              </button>
            </div>
          </EditorCard>

          <EditorCard title="家长评价" description="展示在首页评价模块。">
            <div className="space-y-4">
              {form.testimonials.map((item, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">评价 {index + 1}</div>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => removeTestimonial(index)}
                    >
                      删除
                    </button>
                  </div>
                  <Field label="家长称呼">
                    <input
                      className="form-input"
                      value={item.name}
                      onChange={(event) => updateTestimonial(index, { name: event.target.value })}
                    />
                  </Field>
                  <QiniuImageField
                    label="家长头像"
                    value={item.avatarUrl}
                    onChange={(avatarUrl) => updateTestimonial(index, { avatarUrl })}
                    prefix="homepage/testimonials"
                  />
                  <Field label="评价内容">
                    <textarea
                      className="form-input h-24"
                      value={item.content}
                      onChange={(event) =>
                        updateTestimonial(index, { content: event.target.value })
                      }
                    />
                  </Field>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={addTestimonial}>
                添加评价
              </button>
            </div>
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
