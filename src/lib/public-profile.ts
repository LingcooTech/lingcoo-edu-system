export interface TenantPublicProfile {
  headline: string;
  introduction: string;
  highlights: string[];
  promises: string[];
}

export const defaultTenantPublicProfile: TenantPublicProfile = {
  headline: '社区里的儿童成长教室',
  introduction:
    '围绕儿童表达、专注、审美和动手能力设计小班课程，让孩子在熟悉的社区环境里稳定成长。',
  highlights: [
    '小班教学，关注每个孩子的课堂状态',
    '课程覆盖书法、美术、手工和阅读表达',
    '课后反馈清晰，家长能持续看到进步',
  ],
  promises: ['真实课堂体验', '固定老师跟进', '安全社区空间'],
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

export function readTenantPublicProfile(settings: unknown): TenantPublicProfile {
  const raw = isRecord(settings) && isRecord(settings.publicProfile) ? settings.publicProfile : {};

  return {
    headline: normalizeString(raw.headline) || defaultTenantPublicProfile.headline,
    introduction: normalizeString(raw.introduction) || defaultTenantPublicProfile.introduction,
    highlights: normalizeStringList(raw.highlights, defaultTenantPublicProfile.highlights, 6),
    promises: normalizeStringList(raw.promises, defaultTenantPublicProfile.promises, 6),
  };
}

export function normalizeTenantPublicProfile(input: Partial<TenantPublicProfile>) {
  return {
    headline: normalizeString(input.headline) || defaultTenantPublicProfile.headline,
    introduction: normalizeString(input.introduction) || defaultTenantPublicProfile.introduction,
    highlights: normalizeStringList(input.highlights, defaultTenantPublicProfile.highlights, 6),
    promises: normalizeStringList(input.promises, defaultTenantPublicProfile.promises, 6),
  };
}

export function mergeTenantPublicProfile(settings: unknown, publicProfile: TenantPublicProfile) {
  return {
    ...(isRecord(settings) ? settings : {}),
    publicProfile,
  };
}
