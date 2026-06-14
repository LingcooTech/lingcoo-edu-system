import { useEffect, useState, type ReactNode } from 'react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type { PublicSiteSettings } from '@/api/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
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
    { label: '成长故事', path: '/stories', visible: true },
    { label: '关于', path: '/about', visible: true },
  ],
  pages: {
    courses: {
      eyebrow: '',
      title: '全部课程',
      subtitle: '按年龄与方向开设的小班课程，先预约试听，老师会电话确认适合的班型与时间。',
      seoTitle: '',
    },
    trials: {
      eyebrow: '',
      title: '公开课 / 试听课',
      subtitle: '选择一节公开课，扫码或填表即可预约名额，老师会在课前与你确认。',
      seoTitle: '',
    },
    teachers: {
      eyebrow: '',
      title: '教师团队',
      subtitle: '认识我们的老师，找到适合孩子的那一位。',
      seoTitle: '',
    },
    stories: {
      eyebrow: '',
      title: '成长故事',
      subtitle: '记录孩子从试听、练习到形成习惯的真实变化，用故事呈现课程带来的长期影响。',
      seoTitle: '',
    },
  },
  aboutPage: {
    eyebrow: '',
    title: '关于我们',
    subtitle: '',
    seoTitle: '',
    heroImageUrl: '',
    operatorIntroTitle: '',
    operatorIntro: '',
    brandCooperationTitle: '教学机构介绍',
    brandCooperation: '',
    bodyBlocks: [],
  },
  icpNumber: '',
  icpUrl: '',
};

function normalizeSite(value?: PublicSiteSettings): PublicSiteSettings {
  return {
    navigation: value?.navigation?.length ? value.navigation : DEFAULT_SITE.navigation,
    pages: {
      ...DEFAULT_SITE.pages,
      ...value?.pages,
    },
    aboutPage: {
      ...DEFAULT_SITE.aboutPage,
      ...value?.aboutPage,
      bodyBlocks: value?.aboutPage?.bodyBlocks ?? DEFAULT_SITE.aboutPage.bodyBlocks,
    },
    icpNumber: value?.icpNumber ?? DEFAULT_SITE.icpNumber,
    icpUrl: value?.icpUrl ?? DEFAULT_SITE.icpUrl,
  };
}

export function InstitutionAboutPage() {
  const toast = useToast();
  const [form, setForm] = useState<PublicSiteSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrganization()
      .then((org) => {
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
        aboutPage: { ...form.aboutPage, eyebrow: '' },
      };
      const updated = await saveOrganization({ publicSite });
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
      {!form ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : (
        <div className="max-w-4xl space-y-5">
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
            <Field label="SEO 标题" hint="设置后用于浏览器标签页标题；留空使用页面标题">
              <input
                className="form-input"
                value={form.aboutPage.seoTitle}
                onChange={(event) => updateAbout({ seoTitle: event.target.value })}
              />
            </Field>
            <QiniuImageField
              label="首图 URL"
              value={form.aboutPage.heroImageUrl}
              onChange={(heroImageUrl) => updateAbout({ heroImageUrl })}
              prefix="about/hero"
              previewAlt="关于我们首图"
            />
            <Field label="平台区块标题" hint="留空时前台使用品牌名 + 预约平台">
              <input
                className="form-input"
                value={form.aboutPage.operatorIntroTitle}
                onChange={(event) => updateAbout({ operatorIntroTitle: event.target.value })}
              />
            </Field>
            <Field label="平台介绍" hint="介绍预约平台的服务范围、预约流程和联系方式说明">
              <textarea
                className="form-input h-32"
                value={form.aboutPage.operatorIntro}
                onChange={(event) => updateAbout({ operatorIntro: event.target.value })}
              />
            </Field>
            <Field label="教学机构区块标题">
              <input
                className="form-input"
                value={form.aboutPage.brandCooperationTitle}
                onChange={(event) => updateAbout({ brandCooperationTitle: event.target.value })}
              />
            </Field>
            <Field
              label="教学机构介绍"
              hint="介绍课程交付方、教学理念、师资或校区联系方式；机构资源中的介绍与联系方式也会在前台展示"
            >
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
