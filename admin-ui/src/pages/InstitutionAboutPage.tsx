import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type { OrganizationSettings, PublicNavItem, PublicSiteSettings } from '@/api/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { BlockRenderer } from '@/components/editor/BlockRenderer';
import { HOME_ALLOWED } from '@/components/editor/blocks';
import { PageFrame } from '@/components/layout/PageFrame';
import { Field } from '@/components/shared/FormField';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { useToast } from '@/components/shared/Toast';

const DEFAULT_NAVIGATION: PublicNavItem[] = [
  { label: '首页', path: '/', visible: true },
  { label: '课程', path: '/courses', visible: true },
  { label: '试听', path: '/trials', visible: true },
  { label: '老师', path: '/teachers', visible: true },
  { label: '学员', path: '/students', visible: true },
  { label: '关于', path: '/about', visible: true },
];

function normalizeSite(value?: PublicSiteSettings): PublicSiteSettings {
  return {
    navigation: value?.navigation?.length ? value.navigation : DEFAULT_NAVIGATION,
    aboutPage: {
      title: value?.aboutPage?.title ?? '关于我们',
      subtitle: value?.aboutPage?.subtitle ?? '',
      heroImageUrl: value?.aboutPage?.heroImageUrl ?? '',
      operatorIntro: value?.aboutPage?.operatorIntro ?? '',
      brandCooperation: value?.aboutPage?.brandCooperation ?? '',
      bodyBlocks: value?.aboutPage?.bodyBlocks ?? [],
    },
    icpNumber: value?.icpNumber ?? '',
    icpUrl: value?.icpUrl ?? '',
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

  function updateSite(patch: Partial<PublicSiteSettings>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function updateAbout(patch: Partial<PublicSiteSettings['aboutPage']>) {
    setForm((current) =>
      current ? { ...current, aboutPage: { ...current.aboutPage, ...patch } } : current,
    );
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await saveOrganization({ publicSite: form });
      setOrganization(updated);
      setForm(normalizeSite(updated.publicSite));
      toast.success('公开页面已保存');
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
          {saving ? '保存中...' : '保存公开页面'}
        </button>
      }
    >
      {!form || !organization ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-5">
            <EditorCard title="前台 Header 菜单">
              <NavEditor
                value={form.navigation}
                onChange={(navigation) => updateSite({ navigation })}
              />
            </EditorCard>

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

            <EditorCard title="页脚备案信息">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="备案号">
                  <input
                    className="form-input"
                    placeholder="例如：沪ICP备00000000号-1"
                    value={form.icpNumber}
                    onChange={(event) => updateSite({ icpNumber: event.target.value })}
                  />
                </Field>
                <Field label="备案链接">
                  <input
                    className="form-input"
                    placeholder="https://beian.miit.gov.cn"
                    value={form.icpUrl}
                    onChange={(event) => updateSite({ icpUrl: event.target.value })}
                  />
                </Field>
              </div>
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

function NavEditor({
  value,
  onChange,
}: {
  value: PublicNavItem[];
  onChange: (value: PublicNavItem[]) => void;
}) {
  function patch(index: number, partial: Partial<PublicNavItem>) {
    onChange(
      value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {value.map((item, index) => (
        <div key={index} className="rounded-lg border p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
            <Field label="菜单名称">
              <input
                className="form-input"
                value={item.label}
                onChange={(event) => patch(index, { label: event.target.value })}
              />
            </Field>
            <Field label="链接">
              <input
                className="form-input"
                value={item.path}
                onChange={(event) => patch(index, { path: event.target.value })}
              />
            </Field>
            <div className="mb-3.5 flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost px-2"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="上移菜单"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost px-2"
                onClick={() => move(index, 1)}
                disabled={index === value.length - 1}
                aria-label="下移菜单"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost px-2 text-red-600"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                aria-label="删除菜单"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={item.visible}
              onChange={(event) => patch(index, { visible: event.target.checked })}
            />
            在前台 Header 显示
          </label>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() => onChange([...value, { label: '新菜单', path: '/', visible: true }])}
      >
        <Plus className="h-4 w-4" />
        添加菜单项
      </button>
    </div>
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
