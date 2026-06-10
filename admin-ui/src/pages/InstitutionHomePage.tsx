import { useEffect, useState, type ReactNode } from 'react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type {
  PublicProfile,
  PublicProfileGrowthLoop,
  PublicProfileGrowthLoopStep,
  PublicProfileHighlight,
  PublicProfileStudentStory,
  PublicProfileTestimonial,
} from '@/api/types';
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
  studentStories: PublicProfileStudentStory[];
  growthLoop: PublicProfileGrowthLoop;
  businessHours: string;
}

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

function cleanStudentStories(items: PublicProfileStudentStory[]): PublicProfileStudentStory[] {
  return items
    .map((item) => ({
      title: item.title.trim(),
      studentName: item.studentName.trim(),
      summary: item.summary.trim(),
      coverImageUrl: item.coverImageUrl.trim(),
      content: item.content.trim(),
    }))
    .filter((item) => item.title && (item.summary || item.content));
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
    eyebrow: item.eyebrow.trim(),
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
    studentStories: profile.studentStories,
    growthLoop: profile.growthLoop,
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

  function updateStudentStory(index: number, patch: Partial<PublicProfileStudentStory>) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            studentStories: prev.studentStories.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ),
          }
        : prev,
    );
  }

  function addStudentStory() {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            studentStories: [
              ...prev.studentStories,
              { title: '', studentName: '', summary: '', coverImageUrl: '', content: '' },
            ],
          }
        : prev,
    );
  }

  function removeStudentStory(index: number) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            studentStories: prev.studentStories.filter((_, itemIndex) => itemIndex !== index),
          }
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
          studentStories: cleanStudentStories(form.studentStories),
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
          </EditorCard>

          <EditorCard
            title="成长故事"
            description="展示在首页和「成长故事」页面，适合写成学员成长案例。"
          >
            <div className="space-y-4">
              {form.studentStories.map((item, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">故事 {index + 1}</div>
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-red-600"
                      onClick={() => removeStudentStory(index)}
                    >
                      删除
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="故事标题">
                      <input
                        className="form-input"
                        value={item.title}
                        onChange={(event) =>
                          updateStudentStory(index, { title: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="学员称呼" hint="如：二年级学员 小羽">
                      <input
                        className="form-input"
                        value={item.studentName}
                        onChange={(event) =>
                          updateStudentStory(index, { studentName: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <QiniuImageField
                    label="故事封面"
                    value={item.coverImageUrl}
                    onChange={(coverImageUrl) => updateStudentStory(index, { coverImageUrl })}
                    prefix="homepage/student-stories"
                  />
                  <Field label="摘要" hint="用于首页卡片，建议 60 字以内">
                    <textarea
                      className="form-input h-24"
                      value={item.summary}
                      onChange={(event) =>
                        updateStudentStory(index, { summary: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="正文" hint="用于成长故事页面，可写完整变化过程">
                    <textarea
                      className="form-input h-36"
                      value={item.content}
                      onChange={(event) =>
                        updateStudentStory(index, { content: event.target.value })
                      }
                    />
                  </Field>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={addStudentStory}>
                添加故事
              </button>
            </div>
          </EditorCard>

          <EditorCard
            title="成长闭环"
            description="首页底部的成长路径模块，可设置文案、步骤、按钮和背景。"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="模块标签">
                <input
                  className="form-input"
                  value={form.growthLoop.eyebrow}
                  onChange={(event) => updateGrowthLoop({ eyebrow: event.target.value })}
                />
              </Field>
              <Field label="模块标题">
                <input
                  className="form-input"
                  value={form.growthLoop.title}
                  onChange={(event) => updateGrowthLoop({ title: event.target.value })}
                />
              </Field>
            </div>
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
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[10rem_1fr_auto]"
                >
                  <Field label="图标">
                    <select
                      className="form-input"
                      value={item.icon}
                      onChange={(event) =>
                        updateGrowthLoopStep(index, { icon: event.target.value })
                      }
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
                      onChange={(event) =>
                        updateGrowthLoopStep(index, { title: event.target.value })
                      }
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
