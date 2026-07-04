import { normalizeBlocks, type Block } from './content-blocks.js';

export interface PublicNavItem {
  label: string;
  path: string;
  visible: boolean;
}

export interface PublicPageCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  seoTitle: string;
}

export interface PublicSitePageCopies {
  courses: PublicPageCopy;
  trials: PublicPageCopy;
  teachers: PublicPageCopy;
  stories: PublicPageCopy;
}

export interface MiniShareSettings {
  home: string;
  courses: string;
  trials: string;
  schedule: string;
  teachers: string;
  stories: string;
  accountSchedule: string;
  courseDetail: string;
  trialDetail: string;
  teacherDetail: string;
  storyDetail: string;
  campaign: string;
}

export interface AboutPageSettings {
  eyebrow: string;
  title: string;
  subtitle: string;
  seoTitle: string;
  heroImageUrl: string;
  operatorIntroTitle: string;
  operatorIntro: string;
  brandCooperationTitle: string;
  brandCooperation: string;
  bodyBlocks: Block[];
}

export interface PublicSiteSettings {
  navigation: PublicNavItem[];
  pages: PublicSitePageCopies;
  miniShare: MiniShareSettings;
  aboutPage: AboutPageSettings;
  icpNumber: string;
  icpUrl: string;
}

export const defaultNavigation: PublicNavItem[] = [
  { label: '首页', path: '/', visible: true },
  { label: '课程', path: '/courses', visible: true },
  { label: '试听', path: '/trials', visible: true },
  { label: '老师', path: '/teachers', visible: true },
  { label: '成长故事', path: '/stories', visible: true },
  { label: '关于', path: '/about', visible: true },
];

export const defaultPageCopies: PublicSitePageCopies = {
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
};

export const defaultMiniShareSettings: MiniShareSettings = {
  home: '成长教室',
  courses: '精选课程 · 成长空间',
  trials: '预约试听 · 成长空间',
  schedule: '课表 · 成长空间',
  teachers: '教师团队 · 成长教室',
  stories: '成长故事 · 成长教室',
  accountSchedule: '全部课表 · 成长空间',
  courseDetail: '',
  trialDetail: '',
  teacherDetail: '',
  storyDetail: '',
  campaign: '',
};

export const defaultAboutPage: AboutPageSettings = {
  eyebrow: '',
  title: '关于我们',
  subtitle: '了解预约平台、教学机构和到店咨询方式。',
  seoTitle: '',
  heroImageUrl: '',
  operatorIntroTitle: '',
  operatorIntro:
    '预约平台负责线上课程展示、试听预约、线索留存与家长沟通入口，帮助家长更清楚地了解课程安排，并把预约信息准确同步给教学机构。',
  brandCooperationTitle: '教学机构介绍',
  brandCooperation:
    '教学机构负责课程研发、师资安排、课堂交付与课后反馈。家长可结合课程详情、教师团队和成长故事，判断课程是否适合孩子当前阶段。',
  bodyBlocks: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, limit = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizeConfiguredString(
  raw: Record<string, unknown>,
  key: string,
  limit: number,
  fallback: string,
) {
  return typeof raw[key] === 'string' ? normalizeString(raw[key], limit) : fallback;
}

function normalizeOperatorIntroTitle(value: unknown) {
  const raw = normalizeString(value, 80);
  const legacyDefaults = new Set(['运营方介绍', '预约平台', '美智成长空间预约平台']);
  return raw && !legacyDefaults.has(raw) ? raw : defaultAboutPage.operatorIntroTitle;
}

function normalizePath(value: unknown) {
  const raw = normalizeString(value, 160);
  if (!raw) {
    return '';
  }

  if (raw === '/students') {
    return '/stories';
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

function normalizePageCopy(value: unknown, fallback: PublicPageCopy): PublicPageCopy {
  const raw = isRecord(value) ? value : {};

  return {
    eyebrow: '',
    title: normalizeString(raw.title, 120) || fallback.title,
    subtitle: normalizeConfiguredString(raw, 'subtitle', 240, fallback.subtitle),
    seoTitle: normalizeConfiguredString(raw, 'seoTitle', 120, fallback.seoTitle),
  };
}

function normalizePageCopies(value: unknown): PublicSitePageCopies {
  const raw = isRecord(value) ? value : {};

  return {
    courses: normalizePageCopy(raw.courses, defaultPageCopies.courses),
    trials: normalizePageCopy(raw.trials, defaultPageCopies.trials),
    teachers: normalizePageCopy(raw.teachers, defaultPageCopies.teachers),
    stories: normalizePageCopy(raw.stories, defaultPageCopies.stories),
  };
}

function normalizeMiniShare(value: unknown): MiniShareSettings {
  const raw = isRecord(value) ? value : {};
  return {
    home: normalizeConfiguredString(raw, 'home', 120, defaultMiniShareSettings.home),
    courses: normalizeConfiguredString(raw, 'courses', 120, defaultMiniShareSettings.courses),
    trials: normalizeConfiguredString(raw, 'trials', 120, defaultMiniShareSettings.trials),
    schedule: normalizeConfiguredString(raw, 'schedule', 120, defaultMiniShareSettings.schedule),
    teachers: normalizeConfiguredString(raw, 'teachers', 120, defaultMiniShareSettings.teachers),
    stories: normalizeConfiguredString(raw, 'stories', 120, defaultMiniShareSettings.stories),
    accountSchedule: normalizeConfiguredString(
      raw,
      'accountSchedule',
      120,
      defaultMiniShareSettings.accountSchedule,
    ),
    courseDetail: normalizeConfiguredString(raw, 'courseDetail', 120, defaultMiniShareSettings.courseDetail),
    trialDetail: normalizeConfiguredString(raw, 'trialDetail', 120, defaultMiniShareSettings.trialDetail),
    teacherDetail: normalizeConfiguredString(raw, 'teacherDetail', 120, defaultMiniShareSettings.teacherDetail),
    storyDetail: normalizeConfiguredString(raw, 'storyDetail', 120, defaultMiniShareSettings.storyDetail),
    campaign: normalizeConfiguredString(raw, 'campaign', 120, defaultMiniShareSettings.campaign),
  };
}

function normalizeAboutPage(value: unknown): AboutPageSettings {
  const raw = isRecord(value) ? value : {};

  return {
    eyebrow: '',
    title: normalizeString(raw.title, 120) || defaultAboutPage.title,
    subtitle: normalizeConfiguredString(raw, 'subtitle', 240, defaultAboutPage.subtitle),
    seoTitle: normalizeConfiguredString(raw, 'seoTitle', 120, defaultAboutPage.seoTitle),
    heroImageUrl: normalizeString(raw.heroImageUrl, 500),
    operatorIntroTitle: normalizeOperatorIntroTitle(raw.operatorIntroTitle),
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
    pages: normalizePageCopies(raw.pages),
    miniShare: normalizeMiniShare(raw.miniShare),
    aboutPage: normalizeAboutPage(raw.aboutPage),
    icpNumber: normalizeString(raw.icpNumber, 80),
    icpUrl: normalizePath(raw.icpUrl),
  };
}

export function normalizePublicSite(input: unknown): PublicSiteSettings {
  const raw = isRecord(input) ? input : {};

  return {
    navigation: normalizeNavigation(raw.navigation),
    pages: normalizePageCopies(raw.pages),
    miniShare: normalizeMiniShare(raw.miniShare),
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
