import {
  fetchPublicInstitutions,
  fetchStories,
  loadHome,
  type ContentItem,
  type Course,
  type HomePayload,
  type PublicInstitution,
  type PublicProfileHighlight,
  type PublicTeacher,
  type TrialSession,
} from '../../services/api';
import { coursePriceLabel, formatDateTime, money, navigateToWebPath } from '../../utils/format';
import { createChromeState } from '../../utils/chrome';
import { type Block } from '../../utils/blocks';
import { HOME_QUICK_ACTIONS_ICONS } from '../../utils/icons';

interface HomeTeacherCard {
  id: string;
  name: string;
  initial: string;
  title: string;
  avatarUrl: string;
  tagline: string;
  specialtiesText: string;
  metaText: string;
}

type HomeHighlightCard = PublicProfileHighlight & {
  backgroundStyle: string;
  iconText: string;
  showDescription: boolean;
};

interface HomeStudentStoryCard {
  slug: string;
  title: string;
  coverImageUrl: string;
  excerpt: string;
}

interface HomeCampusCard {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hasLocation: boolean;
  imageUrls: string[];
}

interface HomeInstitutionCard {
  id: string;
  name: string;
  logoUrl: string;
  intro: string;
  introParagraphs: string[];
  contact: string;
}

interface GrowthLoopStepCard {
  title: string;
  indexLabel: string;
}

interface HomeQuickAction {
  key: string;
  label: string;
  iconUrl: string;
  activeIconUrl: string;
}

interface HomeState {
  loading: boolean;
  organizationName: string;
  brandName: string;
  logoUrl: string;
  logoInitial: string;
  customNavStyle: string;
  customNavInnerStyle: string;
  heroStyle: string;
  navLogoStyle: string;
  activeHomeTab: string;
  aboutTitle: string;
  aboutSubtitle: string;
  aboutHeroImageUrl: string;
  aboutPlatformTitle: string;
  aboutPlatformIntro: string;
  aboutPlatformIntroParagraphs: string[];
  aboutTeachingTitle: string;
  aboutTeachingIntro: string;
  aboutTeachingIntroParagraphs: string[];
  aboutBlocks: Block[];
  institutions: HomeInstitutionCard[];
  currentBannerIndex: number;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImages: string[];
  ctaText: string;
  ctaLink: string;
  stats: string[];
  highlights: HomeHighlightCard[];
  contentMarketingTitle: string;
  studentStories: HomeStudentStoryCard[];
  address: string;
  phone: string;
  businessHours: string;
  campuses: HomeCampusCard[];
  growthLoopTitle: string;
  growthLoopSummary: string;
  growthLoopSteps: GrowthLoopStepCard[];
  quickActions: HomeQuickAction[];
  courses: Array<Course & { priceLabel: string }>;
  trialSessions: Array<TrialSession & { startsAtLabel: string; reservationFeeLabel: string }>;
  trustVisible: boolean;
  trustTeachers: HomeTeacherCard[];
}

const initialState: HomeState = {
  loading: true,
  organizationName: '',
  brandName: '',
  logoUrl: '',
  logoInitial: '成',
  customNavStyle: 'height: 88px; padding-top: 48px; padding-right: 100px;',
  customNavInnerStyle: 'height: 32px;',
  heroStyle: 'padding-top: 0;',
  navLogoStyle: 'height: 25px; max-width: 168px;',
  activeHomeTab: 'intro',
  aboutTitle: '',
  aboutSubtitle: '',
  aboutHeroImageUrl: '',
  aboutPlatformTitle: '',
  aboutPlatformIntro: '',
  aboutPlatformIntroParagraphs: [],
  aboutTeachingTitle: '',
  aboutTeachingIntro: '',
  aboutTeachingIntroParagraphs: [],
  aboutBlocks: [],
  institutions: [],
  currentBannerIndex: 0,
  bannerTitle: '',
  bannerSubtitle: '',
  bannerImages: [],
  ctaText: '预约试听',
  ctaLink: '/courses',
  stats: [],
  highlights: [],
  contentMarketingTitle: '成长故事',
  studentStories: [],
  address: '',
  phone: '',
  businessHours: '',
  campuses: [],
  growthLoopTitle: '',
  growthLoopSummary: '',
  growthLoopSteps: [],
  quickActions: [],
  courses: [],
  trialSessions: [],
  trustVisible: false,
  trustTeachers: [],
};

const HOME_QUICK_ACTIONS: HomeQuickAction[] = [
  { key: 'intro', label: '品牌介绍', iconUrl: HOME_QUICK_ACTIONS_ICONS.intro, activeIconUrl: HOME_QUICK_ACTIONS_ICONS.introActive },
  { key: 'advantages', label: '成长理念', iconUrl: HOME_QUICK_ACTIONS_ICONS.advantages, activeIconUrl: HOME_QUICK_ACTIONS_ICONS.advantagesActive },
  { key: 'campuses', label: '空间环境', iconUrl: HOME_QUICK_ACTIONS_ICONS.campuses, activeIconUrl: HOME_QUICK_ACTIONS_ICONS.campusesActive },
  { key: 'teachers', label: '伙伴资源', iconUrl: HOME_QUICK_ACTIONS_ICONS.teachers, activeIconUrl: HOME_QUICK_ACTIONS_ICONS.teachersActive },
  { key: 'stories', label: '成长故事', iconUrl: HOME_QUICK_ACTIONS_ICONS.stories, activeIconUrl: HOME_QUICK_ACTIONS_ICONS.storiesActive },
];

function createHomeChromeState() {
  return {
    ...createChromeState(6),
    heroStyle: 'padding-top: 0;',
  };
}

function toTeacherCard(teacher: PublicTeacher): HomeTeacherCard {
  const specialtiesText = teacher.specialties.slice(0, 2).join(' / ');
  const metaText = [teacher.teachingYears ? `${teacher.teachingYears}教学` : '', specialtiesText]
    .filter(Boolean)
    .join(' · ');
  return {
    id: teacher.id,
    name: teacher.name,
    initial: teacher.name.slice(0, 1) || '师',
    title: teacher.title || '教师档案',
    avatarUrl: teacher.avatarUrl || '',
    tagline: teacher.tagline?.trim() || specialtiesText || '查看老师档案与授课方向',
    specialtiesText,
    metaText,
  };
}

function toHighlightCard(item: PublicProfileHighlight): HomeHighlightCard {
  const title = item.title || item.text;
  return {
    ...item,
    backgroundStyle: item.imageUrl
      ? `background-image: linear-gradient(rgba(31, 43, 36, 0.22), rgba(31, 43, 36, 0.68)), url(${item.imageUrl});`
      : '',
    iconText: highlightIconText(item.icon),
    showDescription: Boolean(item.text && item.text !== title),
  };
}

function highlightIconText(icon: string) {
  const labels: Record<string, string> = {
    'map-pin': '近',
    'graduation-cap': '师',
    'message-circle': '评',
    star: '优',
    'calendar-days': '课',
  };
  return labels[icon] || '优';
}

function toStudentStoryCard(item: ContentItem): HomeStudentStoryCard {
  return {
    slug: item.slug,
    title: item.title,
    coverImageUrl: item.coverUrl ?? '',
    excerpt: item.excerpt || item.content,
  };
}

function toInstitutionCard(item: PublicInstitution): HomeInstitutionCard {
  const intro = item.intro?.trim() || '机构介绍待补充';
  return {
    id: item.id,
    name: item.name,
    logoUrl: item.logoUrl || '',
    intro,
    introParagraphs: toParagraphs(intro),
    contact: item.contact?.trim() || '',
  };
}

function toParagraphs(value: string) {
  return value
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function platformTitleFor(brandName: string, configuredTitle?: string) {
  const raw = configuredTitle?.trim();
  const legacyDefaults = ['运营方介绍', '预约平台', '美智成长空间预约平台'];
  if (raw && !legacyDefaults.includes(raw)) return raw;
  const brand = brandName.trim();
  if (!brand) return '预约平台';
  return brand.endsWith('平台') ? brand : `${brand}预约平台`;
}

function platformIntroFallbackFor(brandName: string) {
  const brand = brandName.trim();
  const subject = brand ? (brand.endsWith('平台') ? brand : `${brand}预约平台`) : '预约平台';
  return `${subject}负责线上课程展示、试听预约、线索留存与家长沟通入口，帮助家长更清楚地了解课程安排。`;
}

function toState(
  home: HomePayload,
  storyItems: ContentItem[] = home.contentItems ?? [],
  institutions: PublicInstitution[] = [],
): HomeState {
  const profile = home.organization.publicProfile;
  const about = home.organization.publicSite?.aboutPage;
  const webBannerImages = Array.from(
    new Set(
      (profile.bannerImages?.length ? profile.bannerImages : [profile.bannerImageUrl]).filter(
        Boolean,
      ),
    ),
  );
  const miniBannerImages = Array.from(new Set((profile.miniBannerImages ?? []).filter(Boolean)));
  const bannerImages = miniBannerImages.length ? miniBannerImages : webBannerImages;
  const teachers = home.teachers ?? [];
  const trustTeachers = teachers.slice(0, 5).map(toTeacherCard);
  const aboutPlatformIntro =
    about?.operatorIntro || platformIntroFallbackFor(home.organization.brandName);
  const aboutTeachingIntro =
    about?.brandCooperation ||
    '教学机构负责课程研发、师资安排、课堂交付与课后反馈。家长可结合课程详情、教师团队和成长故事，判断课程是否适合孩子当前阶段。';

  return {
    ...createHomeChromeState(),
    loading: false,
    organizationName: home.organization.name,
    brandName: home.organization.brandName,
    logoUrl:
      home.organization.branding.fullLogoUrl ||
      home.organization.branding.logoUrl ||
      home.organization.branding.squareLogoUrl ||
      '',
    logoInitial: (home.organization.brandName || home.organization.name || '成').slice(0, 1),
    activeHomeTab: 'intro',
    aboutTitle:
      about?.title || home.organization.publicProfile.bannerTitle || home.organization.brandName,
    aboutSubtitle: about?.subtitle || home.organization.publicProfile.bannerSubtitle,
    aboutHeroImageUrl: about?.heroImageUrl || '',
    aboutPlatformTitle: platformTitleFor(home.organization.brandName, about?.operatorIntroTitle),
    aboutPlatformIntro,
    aboutPlatformIntroParagraphs: toParagraphs(aboutPlatformIntro),
    aboutTeachingTitle:
      about?.brandCooperationTitle && about.brandCooperationTitle !== '品牌合作'
        ? about.brandCooperationTitle
        : '教学机构',
    aboutTeachingIntro,
    aboutTeachingIntroParagraphs: toParagraphs(aboutTeachingIntro),
    aboutBlocks: about?.bodyBlocks || [],
    institutions: institutions.map(toInstitutionCard),
    currentBannerIndex: 0,
    bannerTitle: profile.bannerTitle || home.organization.brandName,
    bannerSubtitle: profile.bannerSubtitle,
    bannerImages,
    ctaText: profile.ctaText || '预约试听',
    ctaLink: profile.ctaLink || '/courses',
    stats: profile.stats ?? [],
    highlights: (profile.highlights ?? []).map(toHighlightCard),
    contentMarketingTitle: profile.contentMarketingTitle || '成长故事',
    studentStories: storyItems.map(toStudentStoryCard),
    address: home.organization.address ?? '',
    phone: home.organization.phone ?? '',
    businessHours: profile.businessHours,
    campuses: (home.campuses ?? []).map((campus) => ({
      id: campus.id,
      name: campus.name,
      address: campus.address ?? '',
      latitude: campus.latitude ?? null,
      longitude: campus.longitude ?? null,
      hasLocation: campus.latitude != null && campus.longitude != null,
      imageUrls: campus.environmentImageUrls ?? [],
    })),
    growthLoopTitle: profile.growthLoop?.title || '让课程围绕孩子持续迭代',
    growthLoopSummary: profile.growthLoop?.summary || '',
    growthLoopSteps: (profile.growthLoop?.steps ?? []).map((step, index) => ({
      title: step.title,
      indexLabel: String(index + 1).padStart(2, '0'),
    })),
    quickActions: HOME_QUICK_ACTIONS,
    courses: home.featuredCourses.map((course) => ({
      ...course,
      priceLabel: coursePriceLabel(
        course,
        home.organization.businessModel.onlinePackageSalesEnabled,
      ),
    })),
    trialSessions: home.trialSessions.map((session) => ({
      ...session,
      startsAtLabel: formatDateTime(session.startsAt),
      reservationFeeLabel:
        session.reservationFeeAmount > 0
          ? `${money(session.reservationFeeAmount)} 试听席位保留费`
          : '',
    })),
    trustVisible: trustTeachers.length > 0,
    trustTeachers,
  };
}

import { shareCard, timelineCard } from '../../utils/share';

Page({
  data: initialState,

  onLoad() {
    this.setData(createHomeChromeState());
    this.load();
  },

  onShareAppMessage() {
    return shareCard(
      this.data.bannerTitle || '成长教室',
      '/pages/home/index',
      this.data.bannerImages && this.data.bannerImages[0],
    );
  },

  onShareTimeline() {
    return timelineCard(
      this.data.bannerTitle || '成长教室',
      '',
      this.data.bannerImages && this.data.bannerImages[0],
    );
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [home, stories, institutions] = await Promise.all([
        loadHome(),
        fetchStories({ limit: 5, offset: 0 }),
        fetchPublicInstitutions(),
      ]);
      wx.setNavigationBarTitle({ title: home.organization.brandName || '成长教室' });
      this.setData(toState(home, stories.items, institutions));
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  onPrimaryCta() {
    navigateToWebPath(this.data.ctaLink);
  },

  goCourses() {
    wx.switchTab({ url: '/pages/courses/index' });
  },

  goTeachers() {
    wx.navigateTo({ url: '/pages/teachers/index' });
  },

  goStories() {
    wx.navigateTo({ url: '/pages/stories/index' });
  },

  onQuickAction(event: { currentTarget: { dataset: { key?: string } } }) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ activeHomeTab: key });
  },

  onBannerChange(event: { detail: { current?: number } }) {
    this.setData({ currentBannerIndex: event.detail.current ?? 0 });
  },

  onPreviewCampusImage(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const { url, urls } = event.currentTarget.dataset;
    if (url && Array.isArray(urls) && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },

  onOpenCampusLocation(event: {
    currentTarget: {
      dataset: {
        name?: string;
        address?: string;
        latitude?: number | string;
        longitude?: number | string;
      };
    };
  }) {
    const { name, address } = event.currentTarget.dataset;
    const latitude = Number(event.currentTarget.dataset.latitude);
    const longitude = Number(event.currentTarget.dataset.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    wx.openLocation({
      latitude,
      longitude,
      name: name || address || '校区位置',
      address: address || '',
      scale: 16,
    });
  },
});
