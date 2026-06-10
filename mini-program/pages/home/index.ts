import {
  loadHome,
  type Course,
  type HomePayload,
  type PublicProfileHighlight,
  type PublicProfileStudentStory,
  type PublicTeacher,
  type TrialSession,
} from '../../services/api';
import { coursePriceLabel, formatDateTime, money, navigateToWebPath } from '../../utils/format';

interface HomeTeacherCard {
  id: string;
  name: string;
  initial: string;
  title: string;
  avatarUrl: string;
  tagline: string;
  specialtiesText: string;
}

type HomeHighlightCard = PublicProfileHighlight & {
  backgroundStyle: string;
  iconText: string;
  showDescription: boolean;
};

type HomeStudentStoryCard = PublicProfileStudentStory & {
  excerpt: string;
};

interface HomeState {
  loading: boolean;
  organizationName: string;
  brandName: string;
  eyebrow: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImages: string[];
  ctaText: string;
  ctaLink: string;
  stats: string[];
  highlights: HomeHighlightCard[];
  studentStories: HomeStudentStoryCard[];
  address: string;
  phone: string;
  businessHours: string;
  matchSteps: string[];
  courses: Array<Course & { priceLabel: string }>;
  trialSessions: Array<TrialSession & { startsAtLabel: string; reservationFeeLabel: string }>;
  trustVisible: boolean;
  trustTeachers: HomeTeacherCard[];
}

const initialState: HomeState = {
  loading: true,
  organizationName: '',
  brandName: '',
  eyebrow: '',
  bannerTitle: '',
  bannerSubtitle: '',
  bannerImages: [],
  ctaText: '预约试听',
  ctaLink: '/courses',
  stats: [],
  highlights: [],
  studentStories: [],
  address: '',
  phone: '',
  businessHours: '',
  matchSteps: ['年龄与基础评估', '课程与试听推荐', '上课时间确认'],
  courses: [],
  trialSessions: [],
  trustVisible: false,
  trustTeachers: [],
};

function toTeacherCard(teacher: PublicTeacher): HomeTeacherCard {
  const specialtiesText = teacher.specialties.slice(0, 2).join(' / ');
  return {
    id: teacher.id,
    name: teacher.name,
    initial: teacher.name.slice(0, 1) || '师',
    title: teacher.title || '教师档案',
    avatarUrl: teacher.avatarUrl || '',
    tagline: teacher.tagline?.trim() || specialtiesText || '查看老师档案与授课方向',
    specialtiesText,
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

function toStudentStoryCard(item: PublicProfileStudentStory): HomeStudentStoryCard {
  return {
    ...item,
    excerpt: item.summary || item.content,
  };
}

function toState(home: HomePayload): HomeState {
  const profile = home.organization.publicProfile;
  const bannerImages = Array.from(
    new Set(
      (profile.bannerImages?.length ? profile.bannerImages : [profile.bannerImageUrl]).filter(
        Boolean,
      ),
    ),
  );
  const teachers = home.teachers ?? [];
  const trustTeachers = teachers.slice(0, 6).map(toTeacherCard);

  return {
    loading: false,
    organizationName: home.organization.name,
    brandName: home.organization.brandName,
    eyebrow: profile.eyebrow || '儿童成长教室',
    bannerTitle: profile.bannerTitle || home.organization.brandName,
    bannerSubtitle: profile.bannerSubtitle,
    bannerImages,
    ctaText: profile.ctaText || '预约试听',
    ctaLink: profile.ctaLink || '/courses',
    stats: profile.stats ?? [],
    highlights: (profile.highlights ?? []).map(toHighlightCard),
    studentStories: (profile.studentStories ?? []).slice(0, 3).map(toStudentStoryCard),
    address: home.organization.address ?? '',
    phone: home.organization.phone ?? '',
    businessHours: profile.businessHours,
    matchSteps: initialState.matchSteps,
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
