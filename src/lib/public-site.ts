import { normalizeBlocks, type Block } from './content-blocks.js';

export interface PublicNavItem {
  label: string;
  path: string;
  visible: boolean;
}

export interface AboutPageSettings {
  eyebrow: string;
  title: string;
  subtitle: string;
  heroImageUrl: string;
  operatorIntroTitle: string;
  operatorIntro: string;
  brandCooperationTitle: string;
  brandCooperation: string;
  bodyBlocks: Block[];
}

export interface PublicSiteSettings {
  navigation: PublicNavItem[];
  aboutPage: AboutPageSettings;
  icpNumber: string;
  icpUrl: string;
}

export const defaultNavigation: PublicNavItem[] = [
  { label: '首页', path: '/', visible: true },
  { label: '课程', path: '/courses', visible: true },
  { label: '试听', path: '/trials', visible: true },
  { label: '老师', path: '/teachers', visible: true },
  { label: '成长故事', path: '/students', visible: true },
  { label: '关于', path: '/about', visible: true },
];

export const defaultAboutPage: AboutPageSettings = {
  eyebrow: 'About',
  title: '关于我们',
  subtitle: '介绍运营方、品牌合作与长期服务能力。',
  heroImageUrl: '',
  operatorIntroTitle: '运营方介绍',
  operatorIntro:
    '这里可以介绍机构运营方背景、团队经验、服务理念，以及为什么选择在本地社区长期经营。',
  brandCooperationTitle: '品牌合作',
  brandCooperation: '这里可以展示品牌合作、课程联合研发、校区资源共建、活动共创等合作信息。',
  bodyBlocks: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, limit = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizePath(value: unknown) {
  const raw = normalizeString(value, 160);
  if (!raw) {
    return '';
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
}

function normalizeNavigation(value: unknown): PublicNavItem[] {
  if (!Array.isArray(value)) {
    return defaultNavigation;
  }

  const items = value
    .map((item): PublicNavItem | null => {
      if (!isRecord(item)) {
        return null;
      }

      const label = normalizeString(item.label, 24);
      const path = normalizePath(item.path);
      if (!label || !path) {
        return null;
      }

      return {
        label,
        path,
        visible: item.visible !== false,
      };
    })
    .filter((item): item is PublicNavItem => item !== null)
    .slice(0, 12);

  return items.length > 0 ? items : defaultNavigation;
}

function normalizeAboutPage(value: unknown): AboutPageSettings {
  const raw = isRecord(value) ? value : {};

  return {
    eyebrow: normalizeString(raw.eyebrow, 80) || defaultAboutPage.eyebrow,
    title: normalizeString(raw.title, 120) || defaultAboutPage.title,
    subtitle: normalizeString(raw.subtitle, 240) || defaultAboutPage.subtitle,
    heroImageUrl: normalizeString(raw.heroImageUrl, 500),
    operatorIntroTitle:
      normalizeString(raw.operatorIntroTitle, 80) || defaultAboutPage.operatorIntroTitle,
    operatorIntro: normalizeString(raw.operatorIntro, 5000) || defaultAboutPage.operatorIntro,
    brandCooperation:
      normalizeString(raw.brandCooperation, 5000) || defaultAboutPage.brandCooperation,
    brandCooperationTitle:
      normalizeString(raw.brandCooperationTitle, 80) || defaultAboutPage.brandCooperationTitle,
    bodyBlocks: normalizeBlocks(raw.bodyBlocks),
  };
}

export function readPublicSite(settings: unknown): PublicSiteSettings {
  const raw = isRecord(settings) && isRecord(settings.publicSite) ? settings.publicSite : {};

  return {
    navigation: normalizeNavigation(raw.navigation),
    aboutPage: normalizeAboutPage(raw.aboutPage),
    icpNumber: normalizeString(raw.icpNumber, 80),
    icpUrl: normalizePath(raw.icpUrl),
  };
}

export function normalizePublicSite(input: unknown): PublicSiteSettings {
  const raw = isRecord(input) ? input : {};

  return {
    navigation: normalizeNavigation(raw.navigation),
    aboutPage: normalizeAboutPage(raw.aboutPage),
    icpNumber: normalizeString(raw.icpNumber, 80),
    icpUrl: normalizePath(raw.icpUrl),
  };
}

export function mergePublicSite(settings: unknown, publicSite: PublicSiteSettings) {
  return {
    ...(isRecord(settings) ? settings : {}),
    publicSite,
  };
}
