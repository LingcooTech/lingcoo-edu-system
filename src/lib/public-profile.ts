import { normalizeBlocks, type Block } from './content-blocks.js';

export interface PublicProfile {
  eyebrow: string;
  highlights: string[];
  bannerImages: string[];
  bannerImageUrl: string;
  bannerTitle: string;
  bannerSubtitle: string;
  ctaText: string;
  ctaLink: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  stats: string[];
  testimonials: string[];
  gallery: string[];
  businessHours: string;
  bodyBlocks: Block[];
}

export const defaultPublicProfile: PublicProfile = {
  eyebrow: '社区小班成长教室',
  highlights: [
    '小班教学，关注每个孩子的课堂状态',
    '课程覆盖书法、美术、手工和阅读表达',
    '课后反馈清晰，家长能持续看到进步',
  ],
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
  stats: ['6-8 人小班', '90 分钟沉浸课堂', '课后反馈可追踪'],
  testimonials: [
    '老师反馈很及时，孩子写字习惯比之前稳定很多。',
    '离家近、班级小，孩子每周都愿意来上课。',
  ],
  gallery: [],
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
    highlights: normalizeStringList(raw.highlights, defaultPublicProfile.highlights, 6),
    bannerImages,
    bannerImageUrl: bannerImages[0] || defaultPublicProfile.bannerImageUrl,
    bannerTitle: normalizeString(raw.bannerTitle) || defaultPublicProfile.bannerTitle,
    bannerSubtitle: normalizeString(raw.bannerSubtitle) || defaultPublicProfile.bannerSubtitle,
    ctaText: normalizeString(raw.ctaText) || defaultPublicProfile.ctaText,
    ctaLink: normalizeString(raw.ctaLink) || defaultPublicProfile.ctaLink,
    secondaryCtaText: normalizeString(raw.secondaryCtaText) || defaultPublicProfile.secondaryCtaText,
    secondaryCtaLink: normalizeString(raw.secondaryCtaLink) || defaultPublicProfile.secondaryCtaLink,
    stats: normalizeStringList(raw.stats, defaultPublicProfile.stats, 6),
    testimonials: normalizeStringList(raw.testimonials, defaultPublicProfile.testimonials, 8),
    gallery: normalizeStringList(raw.gallery, defaultPublicProfile.gallery, 12),
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
    highlights: normalizeStringList(input.highlights, defaultPublicProfile.highlights, 6),
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
    stats: normalizeStringList(input.stats, defaultPublicProfile.stats, 6),
    testimonials: normalizeStringList(input.testimonials, defaultPublicProfile.testimonials, 8),
    gallery: normalizeStringList(input.gallery, defaultPublicProfile.gallery, 12),
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
