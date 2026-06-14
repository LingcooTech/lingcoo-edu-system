import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Save } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type {
  PublicPageCopy,
  PublicProfile,
  PublicProfileGrowthLoop,
  PublicProfileGrowthLoopStep,
  PublicProfileHighlight,
  PublicProfileTestimonial,
  PublicSiteSettings,
} from '@/api/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { HOME_ALLOWED } from '@/components/editor/blocks';
import { PageFrame } from '@/components/layout/PageFrame';
import { AdminTabs } from '@/components/shared/AdminTabs';
import { Field } from '@/components/shared/FormField';
import { QiniuGalleryField, QiniuImageField } from '@/components/shared/QiniuImageField';
import { useToast } from '@/components/shared/Toast';

interface HomeForm {
  highlightsTitle: string;
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
  contentMarketingTitle: string;
  growthLoop: PublicProfileGrowthLoop;
  businessHours: string;
}

interface PageSaveAction {
  label: string;
  disabled: boolean;
  onClick: () => void;
}

type SaveActionChange = (action: PageSaveAction | null) => void;

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

const publicPageTabs = [
  { key: 'home', label: '首页' },
  { key: 'about', label: '关于我们' },
  { key: 'copy', label: '页面文案' },
] as const;

type PublicPageTabKey = (typeof publicPageTabs)[number]['key'];

const HIGHLIGHT_ICON_OPTIONS = [
  { value: 'map-pin', label: '位置' },
  { value: 'graduation-cap', label: '老师' },
  { value: 'message-circle', label: '反馈' },
  { value: 'star', label: '优势' },
  { value: 'calendar-days', label: '课程' },
];

const GROWTH_LOOP_ICON_OPTIONS = [
  { value: 'search', label: '了解' },
  { value: 'target', label: '目标' },
  { value: 'clipboard-list', label: '计划' },
  { value: 'users-round', label: '小班' },
  { value: 'camera', label: '反馈' },
  { value: 'bar-chart-3', label: '复盘' },
  { value: 'refresh-cw', label: '调整' },
  { value: 'arrow-right', label: '下一阶段' },
  { value: 'star', label: '优势' },
];

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanHighlights(items: PublicProfileHighlight[]): PublicProfileHighlight[] {
  return items
    .map((item) => ({
      icon: item.icon.trim(),
      title: item.title.trim(),
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

function cleanGrowthLoopSteps(items: PublicProfileGrowthLoopStep[]): PublicProfileGrowthLoopStep[] {
  return items
    .map((item) => ({
      icon: item.icon.trim(),
      title: item.title.trim(),
    }))
    .filter((item) => item.title)
    .slice(0, 8);
}

function cleanGrowthLoop(item: PublicProfileGrowthLoop): PublicProfileGrowthLoop {
  return {
    eyebrow: '',
    title: item.title.trim(),
    summary: item.summary.trim(),
    primaryCtaText: item.primaryCtaText.trim(),
    primaryCtaLink: item.primaryCtaLink.trim(),
    secondaryCtaText: item.secondaryCtaText.trim(),
    secondaryCtaLink: item.secondaryCtaLink.trim(),
    backgroundColor: item.backgroundColor.trim(),
    backgroundImageUrl: item.backgroundImageUrl.trim(),
    steps: cleanGrowthLoopSteps(item.steps),
  };
}

function withoutPageCopyEyebrows(pages: PublicSiteSettings['pages']): PublicSiteSettings['pages'] {
  return {
    courses: { ...pages.courses, eyebrow: '' },
    trials: { ...pages.trials, eyebrow: '' },
    teachers: { ...pages.teachers, eyebrow: '' },
    stories: { ...pages.stories, eyebrow: '' },
  };
}

function profileToForm(profile: PublicProfile): HomeForm {
  return {
    highlightsTitle: profile.highlightsTitle,
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
    contentMarketingTitle: profile.contentMarketingTitle,
    growthLoop: profile.growthLoop,
    businessHours: profile.businessHours,
  };
}

function normalizePageCopies(value?: PublicSiteSettings['pages']): PublicSiteSettings['pages'] {
  return {
    courses: {
      ...DEFAULT_SITE.pages.courses,
      ...value?.courses,
    },
    trials: {
      ...DEFAULT_SITE.pages.trials,
      ...value?.trials,
    },
    teachers: {
      ...DEFAULT_SITE.pages.teachers,
      ...value?.teachers,
    },
    stories: {
      ...DEFAULT_SITE.pages.stories,
      ...value?.stories,
    },
  };
}

function normalizeSite(value?: PublicSiteSettings): PublicSiteSettings {
  return {
    navigation: value?.navigation?.length ? value.navigation : DEFAULT_SITE.navigation,
    pages: normalizePageCopies(value?.pages),
    aboutPage: {
      ...DEFAULT_SITE.aboutPage,
      ...value?.aboutPage,
      bodyBlocks: value?.aboutPage?.bodyBlocks ?? DEFAULT_SITE.aboutPage.bodyBlocks,
    },
    icpNumber: value?.icpNumber ?? DEFAULT_SITE.icpNumber,
    icpUrl: value?.icpUrl ?? DEFAULT_SITE.icpUrl,
  };
}

export function InstitutionHomePage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<PublicPageTabKey>(
    location.pathname.includes('/about') ? 'about' : 'home',
  );
  const [saveAction, setSaveAction] = useState<PageSaveAction | null>(null);
  const handleSaveActionChange = useCallback<SaveActionChange>((action) => {
    setSaveAction(action);
  }, []);

  useEffect(() => {
    if (location.pathname.includes('/about')) {
      setActiveTab('about');
    }
  }, [location.pathname]);

  useEffect(() => {
    setSaveAction(null);
  }, [activeTab]);

  return (
    <PageFrame
      section="institutionPages"
      className="max-w-none px-0 pt-0"
      headerClassName="mb-0 shrink-0 items-center border-b px-4 py-4 sm:px-6 lg:px-8"
      contentClassName="overflow-hidden pb-0"
      actions={
        <button
          type="button"
          className="btn btn-primary shrink-0"
          onClick={() => saveAction?.onClick()}
          disabled={!saveAction || saveAction.disabled}
        >
          <Save className="h-4 w-4" />
          {saveAction?.label ?? '保存'}
        </button>
      }
    >
      <div className="bg-muted/35 flex h-full min-h-0 flex-col">
        <div className="bg-background/95 shrink-0 border-b px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="max-w-5xl">
            <AdminTabs
              tabs={publicPageTabs}
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as PublicPageTabKey)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          {activeTab === 'home' ? (
            <HomeContentEditor onSaveActionChange={handleSaveActionChange} />
          ) : null}
          {activeTab === 'about' ? (
            <AboutContentEditor onSaveActionChange={handleSaveActionChange} />
          ) : null}
          {activeTab === 'copy' ? (
            <PageCopySettings onSaveActionChange={handleSaveActionChange} />
          ) : null}
        </div>
      </div>
    </PageFrame>
  );
}

function HomeContentEditor({ onSaveActionChange }: { onSaveActionChange: SaveActionChange }) {
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
      prev
        ? {
            ...prev,
            highlights: [...prev.highlights, { icon: 'star', title: '', text: '', imageUrl: '' }],
          }
        : prev,
    );
  }

  function removeHighlight(index: number) {
    setForm((prev) =>
      prev
        ? { ...prev, highlights: prev.highlights.filter((_, itemIndex) => itemIndex !== index) }
        : prev,
    );
  }

  function updateGrowthLoop(patch: Partial<PublicProfileGrowthLoop>) {
    setForm((prev) => (prev ? { ...prev, growthLoop: { ...prev.growthLoop, ...patch } } : prev));
  }

  function updateGrowthLoopStep(index: number, patch: Partial<PublicProfileGrowthLoopStep>) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            growthLoop: {
              ...prev.growthLoop,
              steps: prev.growthLoop.steps.map((item, itemIndex) =>
                itemIndex === index ? { ...item, ...patch } : item,
              ),
            },
          }
        : prev,
    );
  }

  function addGrowthLoopStep() {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            growthLoop: {
              ...prev.growthLoop,
              steps: [...prev.growthLoop.steps, { icon: 'star', title: '' }],
            },
          }
        : prev,
    );
  }

  function removeGrowthLoopStep(index: number) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            growthLoop: {
              ...prev.growthLoop,
              steps: prev.growthLoop.steps.filter((_, itemIndex) => itemIndex !== index),
            },
          }
        : prev,
    );
  }

  const save = useCallback(async () => {
    if (!form || saving) return;
    const bannerImages = linesToList(form.bannerImagesText);
    setSaving(true);
    try {
      const updated = await saveOrganization({
        publicProfile: {
          eyebrow: '',
          highlightsTitle: form.highlightsTitle,
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
          studentStories: [],
          contentMarketingTitle: form.contentMarketingTitle,
          growthLoop: cleanGrowthLoop(form.growthLoop),
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
  }, [form, saving, toast]);

  useEffect(() => {
    onSaveActionChange({
      label: saving ? '保存中...' : '保存主页',
      disabled: !form || saving,
      onClick: save,
    });
    return () => onSaveActionChange(null);
  }, [form, onSaveActionChange, save, saving]);

  if (!form) {
    return <p className="text-muted-foreground text-sm">加载中...</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 pb-10">
      <AccordionSection
        title="首屏转化"
        description="Slogan、机构介绍、轮播图、行动按钮和数据条。"
        defaultOpen
      >
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
      </AccordionSection>

      <AccordionSection title="核心优势" description="首页首屏下方的核心优势总结。">
        <Field label="优势模块标题" hint="移动端显示在优势卡片上方，例如：为什么选择我们">
          <input
            className="form-input"
            value={form.highlightsTitle}
            onChange={(event) => update('highlightsTitle', event.target.value)}
          />
        </Field>
        <div className="space-y-4">
          {form.highlights.map((item, index) => (
            <div key={index} className="border-border/80 rounded-md border p-3">
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
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="图标">
                  <select
                    className="form-input"
                    value={item.icon}
                    onChange={(event) => updateHighlight(index, { icon: event.target.value })}
                  >
                    {HIGHLIGHT_ICON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="标题" hint="例如：离家近">
                  <input
                    className="form-input"
                    value={item.title}
                    onChange={(event) => updateHighlight(index, { title: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="说明文案">
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
      </AccordionSection>

      <AccordionSection
        title="内容营销模块"
        description="首页读取「招生转化 / 内容营销」中已发布内容，这里只维护模块标题。"
      >
        <Field label="模块标题" hint="例如：成长故事、课堂观察、学员变化记录">
          <input
            className="form-input"
            value={form.contentMarketingTitle}
            onChange={(event) => update('contentMarketingTitle', event.target.value)}
          />
        </Field>
      </AccordionSection>

      <AccordionSection
        title="成长闭环"
        description="首页底部的成长路径模块，可设置文案、步骤、按钮和背景。"
      >
        <Field label="模块标题">
          <input
            className="form-input"
            value={form.growthLoop.title}
            onChange={(event) => updateGrowthLoop({ title: event.target.value })}
          />
        </Field>
        <Field label="模块说明">
          <textarea
            className="form-input h-20"
            value={form.growthLoop.summary}
            onChange={(event) => updateGrowthLoop({ summary: event.target.value })}
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="主按钮文字">
            <input
              className="form-input"
              value={form.growthLoop.primaryCtaText}
              onChange={(event) => updateGrowthLoop({ primaryCtaText: event.target.value })}
            />
          </Field>
          <Field label="主按钮链接" hint="如 /register">
            <input
              className="form-input"
              value={form.growthLoop.primaryCtaLink}
              onChange={(event) => updateGrowthLoop({ primaryCtaLink: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="次按钮文字">
            <input
              className="form-input"
              value={form.growthLoop.secondaryCtaText}
              onChange={(event) => updateGrowthLoop({ secondaryCtaText: event.target.value })}
            />
          </Field>
          <Field label="次按钮链接" hint="如 tel:15269284351">
            <input
              className="form-input"
              value={form.growthLoop.secondaryCtaLink}
              onChange={(event) => updateGrowthLoop({ secondaryCtaLink: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="背景色" hint="如 #211f1c">
            <input
              className="form-input"
              value={form.growthLoop.backgroundColor}
              onChange={(event) => updateGrowthLoop({ backgroundColor: event.target.value })}
            />
          </Field>
          <QiniuImageField
            label="背景图片"
            hint="可选；前台会叠加深色遮罩保证文字可读"
            value={form.growthLoop.backgroundImageUrl}
            onChange={(backgroundImageUrl) => updateGrowthLoop({ backgroundImageUrl })}
            prefix="homepage/growth-loop"
          />
        </div>
        <div className="space-y-3">
          <div className="text-sm font-medium">成长步骤</div>
          {form.growthLoop.steps.map((item, index) => (
            <div
              key={index}
              className="border-border/80 grid gap-3 rounded-md border p-3 md:grid-cols-[10rem_1fr_auto]"
            >
              <Field label="图标">
                <select
                  className="form-input"
                  value={item.icon}
                  onChange={(event) => updateGrowthLoopStep(index, { icon: event.target.value })}
                >
                  {GROWTH_LOOP_ICON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="步骤标题">
                <input
                  className="form-input"
                  value={item.title}
                  onChange={(event) => updateGrowthLoopStep(index, { title: event.target.value })}
                />
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-red-600"
                  onClick={() => removeGrowthLoopStep(index)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={addGrowthLoopStep}>
            添加步骤
          </button>
        </div>
      </AccordionSection>

      <AccordionSection title="联系与上课时间">
        <Field label="营业 / 上课时间">
          <input
            className="form-input"
            value={form.businessHours}
            onChange={(e) => update('businessHours', e.target.value)}
          />
        </Field>
      </AccordionSection>
    </div>
  );
}

function AboutContentEditor({ onSaveActionChange }: { onSaveActionChange: SaveActionChange }) {
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

  const save = useCallback(async () => {
    if (!form || saving) return;
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
  }, [form, saving, toast]);

  useEffect(() => {
    onSaveActionChange({
      label: saving ? '保存中...' : '保存关于页',
      disabled: !form || saving,
      onClick: save,
    });
    return () => onSaveActionChange(null);
  }, [form, onSaveActionChange, save, saving]);

  if (!form) {
    return <p className="text-muted-foreground text-sm">加载中...</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <EditorCard title="页面头部与介绍">
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
  );
}

function PageCopySettings({ onSaveActionChange }: { onSaveActionChange: SaveActionChange }) {
  const toast = useToast();
  const [form, setForm] = useState<PublicSiteSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrganization()
      .then((org) => setForm(normalizeSite(org.publicSite)))
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'));
  }, [toast]);

  function updatePages(pages: PublicSiteSettings['pages']) {
    setForm((current) => (current ? { ...current, pages } : current));
  }

  const save = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      const current = await fetchOrganization();
      const publicSite = {
        ...normalizeSite(current.publicSite),
        pages: withoutPageCopyEyebrows(form.pages),
      };
      const updated = await saveOrganization({ publicSite });
      setForm(normalizeSite(updated.publicSite));
      toast.success('页面文案已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [form, saving, toast]);

  useEffect(() => {
    onSaveActionChange({
      label: saving ? '保存中...' : '保存页面文案',
      disabled: !form || saving,
      onClick: save,
    });
    return () => onSaveActionChange(null);
  }, [form, onSaveActionChange, save, saving]);

  if (!form) {
    return <p className="text-muted-foreground text-sm">加载中...</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <EditorCard
        title="列表页文案与 SEO"
        description="配置课程、试听、教师和成长故事列表页顶部文案；SEO 标题会用于浏览器标签页。"
      >
        <PageCopyEditor value={form.pages} onChange={updatePages} />
      </EditorCard>
    </div>
  );
}

const PAGE_COPY_META: Array<{
  key: keyof PublicSiteSettings['pages'];
  label: string;
  description: string;
}> = [
  {
    key: 'courses',
    label: '课程列表页',
    description: '用于 /courses 顶部文案；课程卡片内容来自课程库。',
  },
  {
    key: 'trials',
    label: '试听 / 公开课页',
    description: '用于 /trials 顶部文案；场次内容来自试听场次。',
  },
  {
    key: 'teachers',
    label: '教师团队页',
    description: '用于 /teachers 顶部文案；教师内容来自老师资源。',
  },
  {
    key: 'stories',
    label: '成长故事页',
    description: '用于 /stories 顶部文案；文章内容来自内容营销。',
  },
];

function PageCopyEditor({
  value,
  onChange,
}: {
  value: PublicSiteSettings['pages'];
  onChange: (value: PublicSiteSettings['pages']) => void;
}) {
  function patch(key: keyof PublicSiteSettings['pages'], partial: Partial<PublicPageCopy>) {
    onChange({
      ...value,
      [key]: {
        ...value[key],
        ...partial,
      },
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {PAGE_COPY_META.map((item) => {
        const copy = value[item.key];
        return (
          <section
            key={item.key}
            className="bg-background/70 border-border/80 rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{item.label}</div>
                <p className="text-muted-foreground mt-1 text-xs">{item.description}</p>
              </div>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px] font-medium">
                {item.key}
              </span>
            </div>
            <div className="mt-4 grid gap-4">
              <div className="bg-card border-border/80 rounded-md border p-3">
                <div className="text-muted-foreground mb-3 text-xs font-semibold">页面展示</div>
                <div className="grid gap-3">
                  <Field label="页面标题">
                    <input
                      className="form-input"
                      value={copy.title}
                      onChange={(event) => patch(item.key, { title: event.target.value })}
                    />
                  </Field>
                  <Field label="页面副标题">
                    <textarea
                      className="form-input h-20"
                      value={copy.subtitle}
                      onChange={(event) => patch(item.key, { subtitle: event.target.value })}
                    />
                  </Field>
                </div>
              </div>
              <div className="bg-card border-border/80 rounded-md border p-3">
                <div className="text-muted-foreground mb-3 text-xs font-semibold">SEO</div>
                <Field label="SEO 标题" hint="设置后用于浏览器标签页标题；留空使用页面标题">
                  <input
                    className="form-input"
                    value={copy.seoTitle}
                    onChange={(event) => patch(item.key, { seoTitle: event.target.value })}
                  />
                </Field>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AccordionSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="bg-card border-border/80 overflow-hidden rounded-lg border shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <button
        type="button"
        className="hover:bg-muted/35 flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold">{title}</span>
          {description ? (
            <span className="text-muted-foreground mt-1 block text-sm leading-5">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? <div className="space-y-4 border-t p-5">{children}</div> : null}
    </section>
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
    <section className="bg-card border-border/80 overflow-hidden rounded-lg border shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm leading-5">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}
