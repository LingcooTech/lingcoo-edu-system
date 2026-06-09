import { normalizeBlocks, type Block } from './content-blocks.js';

export interface PublicProfile {
  eyebrow: string;
  headline: string;
  introduction: string;
  highlights: string[];
  promises: string[];
  bannerImages: string[];
  bannerImageUrl: string;
  bannerTitle: string;
  bannerSubtitle: string;
  ctaText: string;
  ctaLink: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  visitEyebrow: string;
  visitTitle: string;
  coursesEyebrow: string;
  coursesTitle: string;
  coursesLinkLabel: string;
  coursesEmptyText: string;
  trialsEyebrow: string;
  trialsTitle: string;
  trialsLinkLabel: string;
  trialsEmptyText: string;
  testimonialsEyebrow: string;
  testimonialsTitle: string;
  stats: string[];
  testimonials: string[];
  gallery: string[];
  faq: string[];
  businessHours: string;
  bodyBlocks: Block[];
}

export const defaultPublicProfile: PublicProfile = {
  eyebrow: '社区小班成长教室',
  headline: '社区里的儿童成长教室',
  introduction:
    '围绕儿童表达、专注、审美和动手能力设计小班课程，让孩子在熟悉的社区环境里稳定成长。',
  highlights: [
    '小班教学，关注每个孩子的课堂状态',
    '课程覆盖书法、美术、手工和阅读表达',
    '课后反馈清晰，家长能持续看到进步',
  ],
  promises: ['真实课堂体验', '固定老师跟进', '安全社区空间'],
  bannerImages: [
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1600&q=80',
  ],
  bannerImageUrl:
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1600&q=80',
  bannerTitle: '在社区里，给孩子一个稳定成长的课堂',
  bannerSubtitle: '小班教学、固定老师、课后反馈，让家长看得见孩子每一步变化。',
  ctaText: '预约试听',
  ctaLink: '/register',
  secondaryCtaText: '浏览课程',
  secondaryCtaLink: '/courses',
  visitEyebrow: 'Visit',
  visitTitle: '到店前先预约，老师会确认适合的班型',
  coursesEyebrow: 'Courses',
  coursesTitle: '推荐课程',
  coursesLinkLabel: '查看全部',
  coursesEmptyText: '课程即将上线',
  trialsEyebrow: 'Trial',
  trialsTitle: '本周公开课',
  trialsLinkLabel: '全部公开课',
  trialsEmptyText: '近期暂无公开课，可直接预约心仪课程的试听。',
  testimonialsEyebrow: 'Testimonials',
  testimonialsTitle: '家长评价',
  stats: ['6-8 人小班', '90 分钟沉浸课堂', '课后反馈可追踪'],
  testimonials: [
    '老师反馈很及时，孩子写字习惯比之前稳定很多。',
    '离家近、班级小，孩子每周都愿意来上课。',
  ],
  gallery: [],
  faq: ['试听课需要提前预约，提交表单后老师会电话确认时间。'],
  businessHours: '周二至周日 10:00-20:00',
  bodyBlocks: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown, fallback: string[], limit: number) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .slice(0, limit);

  return items.length > 0 ? items : fallback;
}

export function readPublicProfile(settings: unknown): PublicProfile {
  const raw = isRecord(settings) && isRecord(settings.publicProfile) ? settings.publicProfile : {};
  const bannerImages = normalizeStringList(
    raw.bannerImages,
    normalizeString(raw.bannerImageUrl)
      ? [normalizeString(raw.bannerImageUrl)]
      : defaultPublicProfile.bannerImages,
    12,
  );

  return {
    eyebrow: normalizeString(raw.eyebrow) || defaultPublicProfile.eyebrow,
    headline: normalizeString(raw.headline) || defaultPublicProfile.headline,
    introduction: normalizeString(raw.introduction) || defaultPublicProfile.introduction,
    highlights: normalizeStringList(raw.highlights, defaultPublicProfile.highlights, 6),
    promises: normalizeStringList(raw.promises, defaultPublicProfile.promises, 6),
    bannerImages,
    bannerImageUrl: bannerImages[0] || defaultPublicProfile.bannerImageUrl,
    bannerTitle: normalizeString(raw.bannerTitle) || defaultPublicProfile.bannerTitle,
    bannerSubtitle: normalizeString(raw.bannerSubtitle) || defaultPublicProfile.bannerSubtitle,
    ctaText: normalizeString(raw.ctaText) || defaultPublicProfile.ctaText,
    ctaLink: normalizeString(raw.ctaLink) || defaultPublicProfile.ctaLink,
    secondaryCtaText: normalizeString(raw.secondaryCtaText) || defaultPublicProfile.secondaryCtaText,
    secondaryCtaLink: normalizeString(raw.secondaryCtaLink) || defaultPublicProfile.secondaryCtaLink,
    visitEyebrow: normalizeString(raw.visitEyebrow) || defaultPublicProfile.visitEyebrow,
    visitTitle: normalizeString(raw.visitTitle) || defaultPublicProfile.visitTitle,
    coursesEyebrow: normalizeString(raw.coursesEyebrow) || defaultPublicProfile.coursesEyebrow,
    coursesTitle: normalizeString(raw.coursesTitle) || defaultPublicProfile.coursesTitle,
    coursesLinkLabel:
      normalizeString(raw.coursesLinkLabel) || defaultPublicProfile.coursesLinkLabel,
    coursesEmptyText:
      normalizeString(raw.coursesEmptyText) || defaultPublicProfile.coursesEmptyText,
    trialsEyebrow: normalizeString(raw.trialsEyebrow) || defaultPublicProfile.trialsEyebrow,
    trialsTitle: normalizeString(raw.trialsTitle) || defaultPublicProfile.trialsTitle,
    trialsLinkLabel: normalizeString(raw.trialsLinkLabel) || defaultPublicProfile.trialsLinkLabel,
    trialsEmptyText: normalizeString(raw.trialsEmptyText) || defaultPublicProfile.trialsEmptyText,
    testimonialsEyebrow:
      normalizeString(raw.testimonialsEyebrow) || defaultPublicProfile.testimonialsEyebrow,
    testimonialsTitle:
      normalizeString(raw.testimonialsTitle) || defaultPublicProfile.testimonialsTitle,
    stats: normalizeStringList(raw.stats, defaultPublicProfile.stats, 6),
    testimonials: normalizeStringList(raw.testimonials, defaultPublicProfile.testimonials, 8),
    gallery: normalizeStringList(raw.gallery, defaultPublicProfile.gallery, 12),
    faq: normalizeStringList(raw.faq, defaultPublicProfile.faq, 8),
    businessHours: normalizeString(raw.businessHours) || defaultPublicProfile.businessHours,
    bodyBlocks: normalizeBlocks(raw.bodyBlocks),
  };
}

// Accepts bodyBlocks as untrusted `unknown` (the zod layer passes it through);
// normalizeBlocks does the structural validation.
type PublicProfileInput = Partial<Omit<PublicProfile, 'bodyBlocks'>> & { bodyBlocks?: unknown };

export function normalizePublicProfile(input: PublicProfileInput) {
  const bannerImages = normalizeStringList(
    input.bannerImages,
    normalizeString(input.bannerImageUrl)
      ? [normalizeString(input.bannerImageUrl)]
      : defaultPublicProfile.bannerImages,
    12,
  );

  return {
    eyebrow: normalizeString(input.eyebrow) || defaultPublicProfile.eyebrow,
    headline: normalizeString(input.headline) || defaultPublicProfile.headline,
    introduction: normalizeString(input.introduction) || defaultPublicProfile.introduction,
    highlights: normalizeStringList(input.highlights, defaultPublicProfile.highlights, 6),
    promises: normalizeStringList(input.promises, defaultPublicProfile.promises, 6),
    bannerImages,
    bannerImageUrl: bannerImages[0] || defaultPublicProfile.bannerImageUrl,
    bannerTitle: normalizeString(input.bannerTitle) || defaultPublicProfile.bannerTitle,
    bannerSubtitle: normalizeString(input.bannerSubtitle) || defaultPublicProfile.bannerSubtitle,
    ctaText: normalizeString(input.ctaText) || defaultPublicProfile.ctaText,
    ctaLink: normalizeString(input.ctaLink) || defaultPublicProfile.ctaLink,
    secondaryCtaText:
      normalizeString(input.secondaryCtaText) || defaultPublicProfile.secondaryCtaText,
    secondaryCtaLink:
      normalizeString(input.secondaryCtaLink) || defaultPublicProfile.secondaryCtaLink,
    visitEyebrow: normalizeString(input.visitEyebrow) || defaultPublicProfile.visitEyebrow,
    visitTitle: normalizeString(input.visitTitle) || defaultPublicProfile.visitTitle,
    coursesEyebrow:
      normalizeString(input.coursesEyebrow) || defaultPublicProfile.coursesEyebrow,
    coursesTitle: normalizeString(input.coursesTitle) || defaultPublicProfile.coursesTitle,
    coursesLinkLabel:
      normalizeString(input.coursesLinkLabel) || defaultPublicProfile.coursesLinkLabel,
    coursesEmptyText:
      normalizeString(input.coursesEmptyText) || defaultPublicProfile.coursesEmptyText,
    trialsEyebrow: normalizeString(input.trialsEyebrow) || defaultPublicProfile.trialsEyebrow,
    trialsTitle: normalizeString(input.trialsTitle) || defaultPublicProfile.trialsTitle,
    trialsLinkLabel:
      normalizeString(input.trialsLinkLabel) || defaultPublicProfile.trialsLinkLabel,
    trialsEmptyText:
      normalizeString(input.trialsEmptyText) || defaultPublicProfile.trialsEmptyText,
    testimonialsEyebrow:
      normalizeString(input.testimonialsEyebrow) || defaultPublicProfile.testimonialsEyebrow,
    testimonialsTitle:
      normalizeString(input.testimonialsTitle) || defaultPublicProfile.testimonialsTitle,
    stats: normalizeStringList(input.stats, defaultPublicProfile.stats, 6),
    testimonials: normalizeStringList(input.testimonials, defaultPublicProfile.testimonials, 8),
    gallery: normalizeStringList(input.gallery, defaultPublicProfile.gallery, 12),
    faq: normalizeStringList(input.faq, defaultPublicProfile.faq, 8),
    businessHours: normalizeString(input.businessHours) || defaultPublicProfile.businessHours,
    bodyBlocks: normalizeBlocks(input.bodyBlocks),
  };
}

export function mergePublicProfile(settings: unknown, publicProfile: PublicProfile) {
  return {
    ...(isRecord(settings) ? settings : {}),
    publicProfile,
  };
}
