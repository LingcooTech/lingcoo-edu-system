export interface PublicProfileHighlight {
  icon: string;
  title: string;
  text: string;
  imageUrl: string;
}

export interface PublicProfileTestimonial {
  name: string;
  avatarUrl: string;
  content: string;
}

export interface PublicProfileStudentStory {
  title: string;
  studentName: string;
  summary: string;
  coverImageUrl: string;
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
  studentStories: PublicProfileStudentStory[];
  businessHours: string;
}

type PublicProfileInput = Partial<
  Omit<PublicProfile, 'highlights' | 'testimonials' | 'studentStories'>
> & {
  highlights?: unknown;
  testimonials?: unknown;
  studentStories?: unknown;
};

export const defaultPublicProfile: PublicProfile = {
  eyebrow: '社区小班成长教室',
  highlights: [
    {
      icon: 'map-pin',
      title: '离家近',
      text: '扎根社区，让教育资源到家门口',
      imageUrl: '',
    },
    {
      icon: 'graduation-cap',
      title: '小班教学',
      text: '老师关注每个孩子的课堂状态',
      imageUrl: '',
    },
    {
      icon: 'message-circle',
      title: '反馈可追踪',
      text: '课后反馈清晰，家长持续看到进步',
      imageUrl: '',
    },
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
  studentStories: [],
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

const defaultHighlightIcons = ['map-pin', 'graduation-cap', 'message-circle'];

function normalizeHighlightIcon(value: unknown, index: number) {
  const icon = normalizeString(value);
  return icon || defaultHighlightIcons[index % defaultHighlightIcons.length] || 'star';
}

function deriveHighlightTitle(text: string) {
  const title = text.split(/[，。,.；;：:\n]/)[0]?.trim() ?? '';
  return title.slice(0, 40);
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
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = normalizeString(item);
        return text
          ? {
              icon: normalizeHighlightIcon(undefined, index),
              title: fallback[index]?.title || deriveHighlightTitle(text),
              text,
              imageUrl: '',
            }
          : null;
      }
      if (!isRecord(item)) return null;
      const text = normalizeString(item.text);
      if (!text) return null;
      const title = normalizeString(item.title) || deriveHighlightTitle(text);
      return {
        icon: normalizeHighlightIcon(item.icon, index),
        title: title || fallback[index]?.title || text,
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

function normalizeStudentStories(
  value: unknown,
  fallback: PublicProfileStudentStory[],
  limit: number,
): PublicProfileStudentStory[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => {
      if (!isRecord(item)) return null;
      const title = normalizeString(item.title);
      const content = normalizeString(item.content);
      const summary = normalizeString(item.summary) || content.slice(0, 120);
      if (!title || (!summary && !content)) return null;
      return {
        title,
        studentName: normalizeString(item.studentName),
        summary,
        coverImageUrl: normalizeString(item.coverImageUrl),
        content,
      };
    })
    .filter((item): item is PublicProfileStudentStory => Boolean(item))
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
    studentStories: normalizeStudentStories(raw.studentStories, [], 8),
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
    studentStories: normalizeStudentStories(input.studentStories, [], 8),
    businessHours: normalizeString(input.businessHours) || defaultPublicProfile.businessHours,
  };
}

export function mergePublicProfile(settings: unknown, publicProfile: PublicProfile) {
  return {
    ...(isRecord(settings) ? settings : {}),
    publicProfile,
  };
}
