import { useEffect, useState, type ReactNode } from 'react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type { OrganizationSettings, PublicSiteSettings } from '@/api/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { BlockRenderer } from '@/components/editor/BlockRenderer';
import { HOME_ALLOWED } from '@/components/editor/blocks';
import { PageFrame } from '@/components/layout/PageFrame';
import { Field } from '@/components/shared/FormField';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { useToast } from '@/components/shared/Toast';

const DEFAULT_SITE: PublicSiteSettings = {
  navigation: [
    { label: '首页', path: '/', visible: true },
    { label: '课程', path: '/courses', visible: true },
    { label: '试听', path: '/trials', visible: true },
    { label: '老师', path: '/teachers', visible: true },
    { label: '学员', path: '/students', visible: true },
    { label: '关于', path: '/about', visible: true },
  ],
  aboutPage: {
    title: '关于我们',
    subtitle: '',
    heroImageUrl: '',
    operatorIntro: '',
    brandCooperation: '',
    bodyBlocks: [],
  },
  icpNumber: '',
  icpUrl: '',
};

function normalizeSite(value?: PublicSiteSettings): PublicSiteSettings {
  return {
    navigation: value?.navigation?.length ? value.navigation : DEFAULT_SITE.navigation,
    aboutPage: {
      ...DEFAULT_SITE.aboutPage,
      ...value?.aboutPage,
    },
    icpNumber: value?.icpNumber ?? DEFAULT_SITE.icpNumber,
    icpUrl: value?.icpUrl ?? DEFAULT_SITE.icpUrl,
  };
}

export function InstitutionAboutPage() {
  const toast = useToast();
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const [form, setForm] = useState<PublicSiteSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrganization()
      .then((org) => {
        setOrganization(org);
        setForm(normalizeSite(org.publicSite));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'));
  }, [toast]);

  function updateAbout(patch: Partial<PublicSiteSettings['aboutPage']>) {
    setForm((current) =>
      current ? { ...current, aboutPage: { ...current.aboutPage, ...patch } } : current,
    );
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const current = await fetchOrganization();
      const publicSite = {
        ...normalizeSite(current.publicSite),
        aboutPage: form.aboutPage,
      };
      const updated = await saveOrganization({ publicSite });
      setOrganization(updated);
      setForm(normalizeSite(updated.publicSite));
      toast.success('关于页已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      section="institutionAbout"
      actions={
        <button type="button" className="btn btn-primary" onClick={save} disabled={!form || saving}>
          {saving ? '保存中...' : '保存关于页'}
        </button>
      }
    >
      {!form || !organization ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-5">
            <EditorCard title="关于我们页面">
              <Field label="页面标题">
                <input
                  className="form-input"
                  value={form.aboutPage.title}
                  onChange={(event) => updateAbout({ title: event.target.value })}
                />
              </Field>
              <Field label="页面副标题">
                <textarea
                  className="form-input h-20"
                  value={form.aboutPage.subtitle}
                  onChange={(event) => updateAbout({ subtitle: event.target.value })}
                />
              </Field>
              <QiniuImageField
                label="首图 URL"
                value={form.aboutPage.heroImageUrl}
                onChange={(heroImageUrl) => updateAbout({ heroImageUrl })}
                prefix="about/hero"
                previewAlt="关于我们首图"
              />
              <Field label="运营方介绍">
                <textarea
                  className="form-input h-32"
                  value={form.aboutPage.operatorIntro}
                  onChange={(event) => updateAbout({ operatorIntro: event.target.value })}
                />
              </Field>
              <Field label="品牌合作">
                <textarea
                  className="form-input h-32"
                  value={form.aboutPage.brandCooperation}
                  onChange={(event) => updateAbout({ brandCooperation: event.target.value })}
                />
              </Field>
            </EditorCard>

            <EditorCard
              title="关于页自由内容模块"
              description="用于补充团队、资质、合作案例、媒体报道等内容"
            >
              <BlockEditor
                value={form.aboutPage.bodyBlocks}
                onChange={(bodyBlocks) => updateAbout({ bodyBlocks })}
                allowed={HOME_ALLOWED}
              />
            </EditorCard>
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            <div className="text-muted-foreground mb-2 text-xs font-medium">实时预览</div>
            <AboutPreview organization={organization} site={form} />
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

function AboutPreview({
  organization,
  site,
}: {
  organization: OrganizationSettings;
  site: PublicSiteSettings;
}) {
  const fullLogoUrl = organization.branding.fullLogoUrl || organization.branding.logoUrl;

  return (
    <section className="overflow-hidden rounded-lg border bg-white">
      {site.aboutPage.heroImageUrl ? (
        <div className="h-44 overflow-hidden border-b">
          <img
            src={site.aboutPage.heroImageUrl}
            alt={site.aboutPage.title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <div className="space-y-6 p-6">
        <div>
          {fullLogoUrl ? (
            <img
              src={fullLogoUrl}
              alt={organization.brandName}
              className="mb-4 h-9 max-w-44 object-contain"
            />
          ) : null}
          <h2 className="text-3xl font-semibold tracking-tight">{site.aboutPage.title}</h2>
          <p className="text-muted-foreground mt-3 text-sm leading-7">{site.aboutPage.subtitle}</p>
        </div>

        <div className="grid gap-4">
          <PreviewSection title="运营方介绍" content={site.aboutPage.operatorIntro} />
          <PreviewSection title="品牌合作" content={site.aboutPage.brandCooperation} />
        </div>

        {site.aboutPage.bodyBlocks.length > 0 ? (
          <div>
            <div className="text-muted-foreground mb-2 text-xs font-medium">自由内容模块</div>
            <BlockRenderer blocks={site.aboutPage.bodyBlocks} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PreviewSection({ title, content }: { title: string; content: string }) {
  if (!content.trim()) return null;

  return (
    <div className="rounded-lg border bg-slate-50 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <p className="text-muted-foreground mt-2 text-sm leading-7 whitespace-pre-line">{content}</p>
    </div>
  );
}
