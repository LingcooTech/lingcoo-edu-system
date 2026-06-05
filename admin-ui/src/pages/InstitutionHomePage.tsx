import { useEffect, useState, type ReactNode } from 'react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type { OrganizationSettings, PublicProfile } from '@/api/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { BlockRenderer } from '@/components/editor/BlockRenderer';
import { HOME_ALLOWED, type Block } from '@/components/editor/blocks';
import { PageFrame } from '@/components/layout/PageFrame';
import { Field } from '@/components/shared/FormField';
import { QiniuGalleryField, QiniuImageField } from '@/components/shared/QiniuImageField';
import { useToast } from '@/components/shared/Toast';

// The structured publicProfile fields are edited here as module cards; list-like
// fields use one-item-per-line textareas (same convention as system settings),
// and a free-form module area uses the shared <BlockEditor>. A live preview on
// the right mirrors the public home page. Saves via PUT /v1/organization.

interface HomeForm {
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImageUrl: string;
  headline: string;
  introduction: string;
  highlightsText: string;
  promisesText: string;
  statsText: string;
  testimonialsText: string;
  galleryText: string;
  faqText: string;
  ctaText: string;
  ctaLink: string;
  businessHours: string;
  bodyBlocks: Block[];
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function profileToForm(profile: PublicProfile): HomeForm {
  return {
    bannerTitle: profile.bannerTitle,
    bannerSubtitle: profile.bannerSubtitle,
    bannerImageUrl: profile.bannerImageUrl,
    headline: profile.headline,
    introduction: profile.introduction,
    highlightsText: profile.highlights.join('\n'),
    promisesText: profile.promises.join('\n'),
    statsText: profile.stats.join('\n'),
    testimonialsText: profile.testimonials.join('\n'),
    galleryText: profile.gallery.join('\n'),
    faqText: profile.faq.join('\n'),
    ctaText: profile.ctaText,
    ctaLink: profile.ctaLink,
    businessHours: profile.businessHours,
    bodyBlocks: profile.bodyBlocks ?? [],
  };
}

export function InstitutionHomePage() {
  const toast = useToast();
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const [form, setForm] = useState<HomeForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrganization()
      .then((org) => {
        setOrganization(org);
        setForm(profileToForm(org.publicProfile));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'));
  }, [toast]);

  function update<K extends keyof HomeForm>(key: K, value: HomeForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await saveOrganization({
        publicProfile: {
          headline: form.headline,
          introduction: form.introduction,
          bannerImageUrl: form.bannerImageUrl,
          bannerTitle: form.bannerTitle,
          bannerSubtitle: form.bannerSubtitle,
          ctaText: form.ctaText,
          ctaLink: form.ctaLink,
          highlights: linesToList(form.highlightsText),
          promises: linesToList(form.promisesText),
          stats: linesToList(form.statsText),
          testimonials: linesToList(form.testimonialsText),
          gallery: linesToList(form.galleryText),
          faq: linesToList(form.faqText),
          businessHours: form.businessHours,
          bodyBlocks: form.bodyBlocks,
        },
      });
      setOrganization(updated);
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
      {!form || !organization ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-5">
            <EditorCard title="首屏 Banner">
              <Field label="主标题">
                <input
                  className="form-input"
                  value={form.bannerTitle}
                  onChange={(e) => update('bannerTitle', e.target.value)}
                />
              </Field>
              <Field label="副标题">
                <textarea
                  className="form-input h-16"
                  value={form.bannerSubtitle}
                  onChange={(e) => update('bannerSubtitle', e.target.value)}
                />
              </Field>
              <QiniuImageField
                label="Banner 背景图 URL"
                value={form.bannerImageUrl}
                onChange={(value) => update('bannerImageUrl', value)}
                prefix="homepage/banner"
                previewAlt="机构 Banner"
              />
              <Field label="一句话定位 headline" hint="副标题为空时展示">
                <input
                  className="form-input"
                  value={form.headline}
                  onChange={(e) => update('headline', e.target.value)}
                />
              </Field>
              <Field label="机构介绍 introduction">
                <textarea
                  className="form-input h-24"
                  value={form.introduction}
                  onChange={(e) => update('introduction', e.target.value)}
                />
              </Field>
            </EditorCard>

            <EditorCard title="亮点与承诺">
              <Field label="教学亮点 highlights" hint="每行一项，建议 3 条">
                <textarea
                  className="form-input h-24"
                  value={form.highlightsText}
                  onChange={(e) => update('highlightsText', e.target.value)}
                />
              </Field>
              <Field label="服务承诺 promises" hint="每行一项">
                <textarea
                  className="form-input h-20"
                  value={form.promisesText}
                  onChange={(e) => update('promisesText', e.target.value)}
                />
              </Field>
            </EditorCard>

            <EditorCard title="数据与评价">
              <Field label="数据条 stats" hint="每行一项，如「6-8 人小班」">
                <textarea
                  className="form-input h-20"
                  value={form.statsText}
                  onChange={(e) => update('statsText', e.target.value)}
                />
              </Field>
              <Field label="家长评价 testimonials" hint="每行一条">
                <textarea
                  className="form-input h-24"
                  value={form.testimonialsText}
                  onChange={(e) => update('testimonialsText', e.target.value)}
                />
              </Field>
            </EditorCard>

            <EditorCard title="图库与常见问题">
              <QiniuGalleryField
                label="图库 gallery"
                hint="每行一个图片 URL"
                value={form.galleryText}
                onChange={(value) => update('galleryText', value)}
                prefix="homepage/gallery"
              />
              <Field label="常见问题 faq" hint="每行一条">
                <textarea
                  className="form-input h-20"
                  value={form.faqText}
                  onChange={(e) => update('faqText', e.target.value)}
                />
              </Field>
            </EditorCard>

            <EditorCard title="行动号召与营业信息">
              <div className="grid grid-cols-2 gap-3">
                <Field label="按钮文字">
                  <input
                    className="form-input"
                    value={form.ctaText}
                    onChange={(e) => update('ctaText', e.target.value)}
                  />
                </Field>
                <Field label="按钮链接" hint="如 /register">
                  <input
                    className="form-input"
                    value={form.ctaLink}
                    onChange={(e) => update('ctaLink', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="营业 / 上课时间">
                <input
                  className="form-input"
                  value={form.businessHours}
                  onChange={(e) => update('businessHours', e.target.value)}
                />
              </Field>
            </EditorCard>

            <EditorCard
              title="自由内容模块"
              description="像搭积木一样追加自定义模块，展示在主页正文区"
            >
              <BlockEditor
                value={form.bodyBlocks}
                onChange={(bodyBlocks) => update('bodyBlocks', bodyBlocks)}
                allowed={HOME_ALLOWED}
              />
            </EditorCard>
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            <div className="text-muted-foreground mb-2 text-xs font-medium">实时预览</div>
            <HomePreview form={form} organization={organization} />
          </div>
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
      {children}
    </section>
  );
}

function HomePreview({
  form,
  organization,
}: {
  form: HomeForm;
  organization: OrganizationSettings;
}) {
  const branding = organization.branding;
  const fullLogoUrl = branding?.fullLogoUrl || branding?.logoUrl;
  const squareLogoUrl = branding?.squareLogoUrl || fullLogoUrl;
  const stats = linesToList(form.statsText);
  const testimonials = linesToList(form.testimonialsText);

  return (
    <section
      className="overflow-hidden rounded-lg border bg-white"
      style={{
        backgroundColor: branding?.backgroundColor || undefined,
        color: branding?.textColor || undefined,
      }}
    >
      {form.bannerImageUrl ? (
        <div className="h-44 overflow-hidden border-b">
          <img src={form.bannerImageUrl} alt="机构 Banner" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="space-y-6 p-6">
        <div>
          <div className="mb-4 flex items-center gap-3">
            {squareLogoUrl ? (
              <img
                src={squareLogoUrl}
                alt="方形 Logo"
                className="h-10 w-10 rounded-xl border bg-white object-contain p-1.5"
              />
            ) : null}
            {fullLogoUrl ? (
              <img src={fullLogoUrl} alt="完整 Logo" className="h-9 max-w-44 object-contain" />
            ) : (
              <div className="text-muted-foreground text-sm">{organization.name}</div>
            )}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            {form.bannerTitle || organization.brandName || '机构品牌名称'}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7">
            {form.bannerSubtitle || form.headline || '这里展示机构对外主页的首屏标题。'}
          </p>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
            {form.introduction || '完善机构介绍后，这里会同步展示。'}
          </p>
          {form.ctaText ? (
            <span className="btn btn-primary pointer-events-none mt-4 inline-flex">
              {form.ctaText}
            </span>
          ) : null}
          {stats.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {stats.map((item) => (
                <span key={item} className="rounded-full border bg-white/80 px-3 py-1 text-sm">
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-white/80 p-4">
          <div className="text-sm font-semibold">机构信息</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">电话</span>
              <span>{organization.phone || '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">地址</span>
              <span className="text-right">{organization.address || '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">上课时间</span>
              <span className="text-right">{form.businessHours || '-'}</span>
            </div>
          </div>
          {testimonials.length > 0 && (
            <>
              <div className="mt-5 text-sm font-semibold">用户评价</div>
              <div className="mt-3 space-y-2">
                {testimonials.map((item) => (
                  <div key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                    {item}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {form.bodyBlocks.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-2 text-xs font-medium">自由内容模块</div>
            <BlockRenderer blocks={form.bodyBlocks} />
          </div>
        )}
      </div>
    </section>
  );
}
