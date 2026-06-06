import { loadHome, type Course, type HomePayload, type TrialSession } from '../../services/api';
import { coursePriceLabel, formatDateTime, navigateToWebPath } from '../../utils/format';
import { parseBlocks, type Block } from '../../utils/blocks';

interface HomeState {
  loading: boolean;
  organizationName: string;
  brandName: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImages: string[];
  ctaText: string;
  ctaLink: string;
  stats: string[];
  highlights: string[];
  testimonials: string[];
  address: string;
  phone: string;
  businessHours: string;
  courses: Array<Course & { priceLabel: string }>;
  trialSessions: Array<TrialSession & { startsAtLabel: string }>;
  bodyBlocks: Block[];
}

const initialState: HomeState = {
  loading: true,
  organizationName: '',
  brandName: '',
  bannerTitle: '',
  bannerSubtitle: '',
  bannerImages: [],
  ctaText: '预约试听',
  ctaLink: '/courses',
  stats: [],
  highlights: [],
  testimonials: [],
  address: '',
  phone: '',
  businessHours: '',
  courses: [],
  trialSessions: [],
  bodyBlocks: [],
};

function toState(home: HomePayload): HomeState {
  const profile = home.organization.publicProfile;
  const bannerImages = Array.from(
    new Set(
      (profile.bannerImages?.length ? profile.bannerImages : [profile.bannerImageUrl]).filter(
        Boolean,
      ),
    ),
  );
  return {
    loading: false,
    organizationName: home.organization.name,
    brandName: home.organization.brandName,
    bannerTitle: profile.bannerTitle || profile.headline || home.organization.brandName,
    bannerSubtitle: profile.bannerSubtitle || profile.introduction,
    bannerImages,
    ctaText: profile.ctaText || '预约试听',
    ctaLink: profile.ctaLink || '/courses',
    stats: profile.stats ?? [],
    highlights: profile.highlights ?? [],
    testimonials: profile.testimonials ?? [],
    address: home.organization.address ?? '',
    phone: home.organization.phone ?? '',
    businessHours: profile.businessHours,
    courses: home.featuredCourses.map((course) => ({
      ...course,
      priceLabel: coursePriceLabel(course),
    })),
    trialSessions: home.trialSessions.map((session) => ({
      ...session,
      startsAtLabel: formatDateTime(session.startsAt),
    })),
    bodyBlocks: parseBlocks(profile.bodyBlocks),
  };
}

Page({
  data: initialState,

  onLoad() {
    this.load();
  },

  async onPullDownRefresh() {
    await this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const home = await loadHome();
      wx.setNavigationBarTitle({ title: home.organization.brandName || '成长教室' });
      this.setData(toState(home));
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
    wx.navigateTo({ url: '/pages/courses/index' });
  },

  goTeachers() {
    wx.navigateTo({ url: '/pages/teachers/index' });
  },

  goAccount() {
    wx.navigateTo({ url: '/pages/account/index' });
  },
});
