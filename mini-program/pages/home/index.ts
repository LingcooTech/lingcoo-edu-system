import {
  loadHome,
  type Course,
  type HomePayload,
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
  trialSessions: Array<TrialSession & { startsAtLabel: string; reservationFeeLabel: string }>;
  trustVisible: boolean;
  trustTeachers: HomeTeacherCard[];
  campusCountText: string;
  classroomCountText: string;
  courseTeacherNamesText: string;
  teachingLocations: string[];
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
  trustVisible: false,
  trustTeachers: [],
  campusCountText: '-',
  classroomCountText: '-',
  courseTeacherNamesText: '',
  teachingLocations: [],
};

function uniqueStrings(values: Array<string | null | undefined>, limit: number): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  ).slice(0, limit);
}

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
  const classrooms = home.classrooms ?? [];
  const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const courseTeacherNames = uniqueStrings(
    home.featuredCourses.map((course) =>
      course.defaultTeacherId ? teacherById.get(course.defaultTeacherId)?.name : undefined,
    ),
    3,
  );
  const teachingLocations = uniqueStrings(
    [
      ...home.featuredCourses.map((course) => course.teachingLocationLabel),
      ...home.campuses.map((campus) => campus.address || campus.name),
    ],
    4,
  );
  const trustTeachers = teachers.slice(0, 2).map(toTeacherCard);

  return {
    loading: false,
    organizationName: home.organization.name,
    brandName: home.organization.brandName,
    bannerTitle: profile.bannerTitle || home.organization.brandName,
    bannerSubtitle: profile.bannerSubtitle,
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
    trustVisible: Boolean(
      trustTeachers.length ||
        home.campuses.length ||
        classrooms.length ||
        courseTeacherNames.length ||
        teachingLocations.length,
    ),
    trustTeachers,
    campusCountText: home.campuses.length ? String(home.campuses.length) : '-',
    classroomCountText: classrooms.length ? String(classrooms.length) : '-',
    courseTeacherNamesText: courseTeacherNames.join('、'),
    teachingLocations,
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
