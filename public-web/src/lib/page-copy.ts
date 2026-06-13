import type { HomePayload, PublicPageCopy, PublicSitePageCopies } from '@/api/client';

export type PublicPageKey = keyof PublicSitePageCopies;

export const DEFAULT_PAGE_COPIES: PublicSitePageCopies = {
  courses: {
    eyebrow: '课程',
    title: '全部课程',
    subtitle: '按年龄与方向开设的小班课程，先预约试听，老师会电话确认适合的班型与时间。',
    seoTitle: '',
  },
  trials: {
    eyebrow: '试听预约',
    title: '公开课 / 试听课',
    subtitle: '选择一节公开课，扫码或填表即可预约名额，老师会在课前与你确认。',
    seoTitle: '',
  },
  teachers: {
    eyebrow: '教师团队',
    title: '教师团队',
    subtitle: '认识我们的老师，找到适合孩子的那一位。',
    seoTitle: '',
  },
  stories: {
    eyebrow: '成长故事',
    title: '成长故事',
    subtitle: '记录孩子从试听、练习到形成习惯的真实变化，用故事呈现课程带来的长期影响。',
    seoTitle: '',
  },
};

function configuredText(value: string | undefined, fallback: string) {
  return value === undefined ? fallback : value.trim();
}

export function getPageCopy(
  home: HomePayload | null,
  key: PublicPageKey,
  fallback?: Partial<PublicPageCopy>,
): PublicPageCopy {
  const defaults = { ...DEFAULT_PAGE_COPIES[key], ...fallback };
  const configured = home?.organization.publicSite?.pages?.[key];

  return {
    eyebrow: configuredText(configured?.eyebrow, defaults.eyebrow),
    title: configured?.title?.trim() || defaults.title,
    subtitle: configuredText(configured?.subtitle, defaults.subtitle),
    seoTitle: configuredText(configured?.seoTitle, defaults.seoTitle),
  };
}
