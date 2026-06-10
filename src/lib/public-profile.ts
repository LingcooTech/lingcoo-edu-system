export interface PublicProfileHighlight {
  text: string;
  imageUrl: string;
}

export interface PublicProfileTestimonial {
  name: string;
  avatarUrl: string;
  content: string;
}

export interface PublicProfile {
  eyebrow: string;
  highlights: PublicProfileHighlight[];
  bannerImages: string[];
  bannerImageUrl: string;
  bannerTitle: string;
  bannerSubtitle: string;
  ctaText: string;
  ctaLink: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  stats: string[];
  testimonials: PublicProfileTestimonial[];
  businessHours: string;
}

type PublicProfileInput = Partial<Omit<PublicProfile, 'highlights' | 'testimonials'>> & {
  highlights?: unknown;
  testimonials?: unknown;
};

export const defaultPublicProfile: PublicProfile = {
  eyebrow: '社区小班成长教室',
  highlights: [
    { text: '小班教学，关注每个孩子的课堂状态', imageUrl: '' },
    { text: '课程覆盖书法、美术、手工和阅读表达', imageUrl: '' },
    { text: '课后反馈清晰，家长能持续看到进步', imageUrl: '' },
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
    { name: '一年级家长', avatarUrl: '', content: '老师反馈很及时，孩子写字习惯比之前稳定很多。' },
    { name: '小班学员家长', avatarUrl: '', content: '离家近、班级小，孩子每周都愿意来上课。' },
  ],
  businessHours: '周二至周日 10:00-20:00',
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

function normalizeHighlights(
  value: unknown,
  fallback: PublicProfileHighlight[],
  limit: number,
): PublicProfileHighlight[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => {
      if (typeof item === 'string') {
        const text = normalizeString(item);
        return text ? { text, imageUrl: '' } : null;
      }
      if (!isRecord(item)) return null;
      const text = normalizeString(item.text);
      if (!text) return null;
      return {
        text,
        imageUrl: normalizeString(item.imageUrl),
      };
    })
    .filter((item): item is PublicProfileHighlight => Boolean(item))
    .slice(0, limit);

  return items.length > 0 ? items : fallback;
}

function normalizeTestimonials(
  value: unknown,
  fallback: PublicProfileTestimonial[],
  limit: number,
): PublicProfileTestimonial[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => {
      if (typeof item === 'string') {
        const content = normalizeString(item);
        return content ? { name: '', avatarUrl: '', content } : null;
      }
      if (!isRecord(item)) return null;
      const content = normalizeString(item.content);
      if (!content) return null;
      return {
        name: normalizeString(item.name),
        avatarUrl: normalizeString(item.avatarUrl),
        content,
      };
    })
    .filter((item): item is PublicProfileTestimonial => Boolean(item))
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
    highlights: normalizeHighlights(raw.highlights, defaultPublicProfile.highlights, 6),
    bannerImages,
    bannerImageUrl: bannerImages[0] || defaultPublicProfile.bannerImageUrl,
    bannerTitle: normalizeString(raw.bannerTitle) || defaultPublicProfile.bannerTitle,
    bannerSubtitle: normalizeString(raw.bannerSubtitle) || defaultPublicProfile.bannerSubtitle,
    ctaText: normalizeString(raw.ctaText) || defaultPublicProfile.ctaText,
    ctaLink: normalizeString(raw.ctaLink) || defaultPublicProfile.ctaLink,
    secondaryCtaText:
      normalizeString(raw.secondaryCtaText) || defaultPublicProfile.secondaryCtaText,
    secondaryCtaLink:
      normalizeString(raw.secondaryCtaLink) || defaultPublicProfile.secondaryCtaLink,
    stats: normalizeStringList(raw.stats, defaultPublicProfile.stats, 6),
    testimonials: normalizeTestimonials(raw.testimonials, defaultPublicProfile.testimonials, 8),
    businessHours: normalizeString(raw.businessHours) || defaultPublicProfile.businessHours,
  };
}

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
    highlights: normalizeHighlights(input.highlights, defaultPublicProfile.highlights, 6),
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
    testimonials: normalizeTestimonials(input.testimonials, defaultPublicProfile.testimonials, 8),
    businessHours: normalizeString(input.businessHours) || defaultPublicProfile.businessHours,
  };
}

export function mergePublicProfile(settings: unknown, publicProfile: PublicProfile) {
  return {
    ...(isRecord(settings) ? settings : {}),
    publicProfile,
  };
}
