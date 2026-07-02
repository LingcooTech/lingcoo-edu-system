import type { Block } from '../utils/blocks';
import { API_BASE_URL, TOKEN_KEY } from './config';

export interface Course {
  id: string;
  slug: string;
  courseSeriesId?: string | null;
  campusId?: string | null;
  name: string;
  category: string;
  ageRange: string;
  durationMinutes: number;
  providerInstitutionId?: string | null;
  defaultTeacherId?: string | null;
  defaultTeacherIds?: string[];
  classroomId?: string | null;
  classroomIds?: string[];
  teachingLocationLabel?: string | null;
  paymentReceiverType?: 'platform' | 'provider' | 'other';
  paymentReceiverInstitutionId?: string | null;
  paymentReceiverName?: string | null;
  trialDescription?: string;
  reservationNotice?: string;
  coverImageUrl?: string | null;
  coverThumbUrl?: string | null;
  onlineSalesEnabled?: boolean;
  packageCount?: number;
  startingPriceAmount?: number | null;
  summary: string;
  content?: string;
}

export interface CoursePackage {
  id: string;
  courseId?: string | null;
  courseSeriesId?: string | null;
  name: string;
  description: string;
  lessonCount: number;
  giftedLessonCount: number;
  priceAmount: number;
  discountPriceAmount?: number | null;
}

export interface PublicCampus {
  id: string;
  name: string;
  address?: string | null;
  environmentImageUrls?: string[];
}

export interface PublicClassroom {
  id: string;
  campusId: string;
  name: string;
  capacity: number;
  status: string;
}

export interface TrialSession {
  id: string;
  campusId: string;
  courseId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  reservationFeeAmount: number;
  reservationNotice: string;
  coverImageUrl?: string | null;
  coverThumbUrl?: string | null;
}

export type ContentSourceType = 'manual' | 'wordpress' | 'notion' | 'wechat';
export type ContentStatus = 'draft' | 'published' | 'archived';

export interface ContentItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  authorName: string | null;
  sourceType: ContentSourceType;
  sourceId: string | null;
  sourceUrl: string | null;
  status: ContentStatus;
  isPinned: boolean;
  publishedAt: string | null;
  importedAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContentListResponse {
  items: ContentItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface BusinessModelSettings {
  onlinePackageSalesEnabled: boolean;
  manualPackageGrantEnabled: boolean;
  packagePriceDisplayEnabled: boolean;
  seatReservationFeeEnabled: boolean;
}

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

export interface PublicProfileGrowthLoopStep {
  icon: string;
  title: string;
}

export interface PublicProfileGrowthLoop {
  eyebrow: string;
  title: string;
  summary: string;
  primaryCtaText: string;
  primaryCtaLink: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  steps: PublicProfileGrowthLoopStep[];
}

export interface Organization {
  id: string;
  name: string;
  brandName: string;
  phone: string | null;
  address: string | null;
  publicProfile: {
    eyebrow: string;
    highlightsTitle: string;
    highlights: PublicProfileHighlight[];
    bannerImages: string[];
    miniBannerImages: string[];
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
    contentMarketingTitle: string;
    growthLoop: PublicProfileGrowthLoop;
    businessHours: string;
  };
  businessModel: BusinessModelSettings;
  publicSite?: {
    navigation: Array<{
      label: string;
      path: string;
      visible: boolean;
    }>;
    pages: {
      courses: { eyebrow: string; title: string; subtitle: string };
      trials: { eyebrow: string; title: string; subtitle: string };
      teachers: { eyebrow: string; title: string; subtitle: string };
      stories: { eyebrow: string; title: string; subtitle: string };
    };
    aboutPage: {
      eyebrow: string;
      title: string;
      subtitle: string;
      heroImageUrl: string;
      operatorIntroTitle: string;
      operatorIntro: string;
      brandCooperationTitle: string;
      brandCooperation: string;
      bodyBlocks?: Block[];
    };
    icpNumber: string;
    icpUrl: string;
  };
  branding: {
    fullLogoUrl?: string;
    squareLogoUrl?: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    cardColor?: string;
    textColor?: string;
  };
}

export interface HomePayload {
  organization: Organization;
  campuses: Array<{
    id: string;
    name: string;
    address: string | null;
    latitude?: number | null;
    longitude?: number | null;
    environmentImageUrls?: string[];
  }>;
  teachers: PublicTeacher[];
  featuredCourses: Course[];
  trialSessions: TrialSession[];
  contentItems: ContentItem[];
}

export interface CourseDetail {
  course: Course;
  coursePackages: CoursePackage[];
  providerInstitution?: PublicInstitution | null;
  defaultTeacher?: PublicTeacher | null;
  defaultTeachers?: PublicTeacher[];
  classroom?: PublicClassroom | null;
  classrooms?: PublicClassroom[];
  campus?: PublicCampus | null;
  campuses?: PublicCampus[];
  paymentReceiverInstitution?: PublicInstitution | null;
  studentWorks?: StudentWork[];
  businessModel: BusinessModelSettings;
}

export interface CampaignLandingPayload {
  campaign: {
    id: string;
    channelId: string;
    code: string;
    name: string;
    courseSlug?: string | null;
    medium: string;
    status: string;
    content?: string;
  };
  channel: { id: string; code: string; name: string } | null;
  course: Course | null;
  trialSessions: TrialSession[];
  organization: Organization;
}

export interface TrialDetail {
  trialSession: TrialSession;
  course: Course;
  providerInstitution?: PublicInstitution | null;
  campus: { id: string; name: string; address: string | null } | null;
  organization: Organization;
}

export interface TrialRegistrationInput {
  guardianName: string;
  phone?: string;
  studentName: string;
  grade: string;
  campusId?: string;
  courseId?: string;
  trialSessionId?: string;
  preferredTeacherId?: string;
  source?: string;
  campaign?: string;
  course?: string;
  medium?: string;
}

export interface SeatReservationInput extends Omit<TrialRegistrationInput, 'courseId'> {
  trialSessionId: string;
  phoneCode?: string;
  wechatMiniCode?: string;
}

export interface SeatReservation {
  id: string;
  orderNo: string;
  courseId?: string | null;
  trialSessionId?: string | null;
  originalTrialSessionId?: string | null;
  guardianName: string;
  phone: string;
  studentName: string;
  grade: string;
  reservationFeeAmount: number;
  reservationStatus: string;
  paymentStatus: string;
  checkInStatus: string;
  rescheduleCount: number;
  cancelBefore?: string | null;
  rescheduledAt?: string | null;
  createdAt: string;
}

export interface ParentSeatReservation extends SeatReservation {
  course?: Course | null;
  trialSession?: TrialSession | null;
  campus?: { id: string; name: string; address?: string | null } | null;
  canReschedule: boolean;
  rescheduleOptions: TrialSession[];
}

export interface CreateOrderInput {
  packageId: string;
  courseId?: string;
  studentId?: string;
  guardianName?: string;
  guardianPhone?: string;
  phoneCode?: string;
  studentName?: string;
  grade?: string;
  source?: string;
  campaign?: string;
  medium?: string;
  wechatMiniCode?: string;
}

export type SubscribeTemplateKey =
  | 'trial_registration'
  | 'payment_success'
  | 'lesson_reminder'
  | 'lesson_consumed'
  | 'learning_update';

export interface WechatMiniSubscribeTemplate {
  key: SubscribeTemplateKey;
  label: string;
  templateId: string;
}

export interface PublicTeacher {
  id: string;
  name: string;
  phone?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  institutionId?: string | null;
  tagline?: string | null;
  wechatQrUrl?: string | null;
  education?: string | null;
  teachingExperience?: string | null;
  teachingStyle?: string | null;
  achievements?: string | null;
  teachingYears?: string | null;
  studentCount?: string | null;
  retentionRate?: string | null;
  teachingPhilosophy?: string | null;
  classPhotoUrls: string[];
  studentWorkUrls: string[];
  parentTestimonials: string[];
  bio?: string | null;
  specialties: string[];
  isPinned?: boolean;
  status: string;
}

export interface PublicInstitution {
  id: string;
  name: string;
  logoUrl?: string | null;
  intro?: string | null;
  contact?: string | null;
  sortOrder?: number;
}

export interface PublicTeacherDetail {
  teacher: PublicTeacher;
  institution: { id: string; name: string; logoUrl?: string | null } | null;
  courses: Course[];
}

export interface AuthAccount {
  id: string;
  role: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
}

export interface AdminMetricSummary {
  todaySessions: number;
  todayLeads: number;
  monthRevenue: number;
  monthRevenueLabel: number;
  paidOrders: number;
  pendingOrders: number;
  activeStudents: number;
  lowLessonAccounts: number;
}

export interface AdminOrderSummary {
  id: string;
  orderNo: string;
  status: string;
  amount: number;
  paidAmount: number;
  amountLabel: number;
  paidAmountLabel: number;
  studentName: string;
  courseName: string;
  createdAt: string;
}

export interface AdminStudentSummary {
  id: string;
  name: string;
  grade: string;
  school: string;
  status: string;
  guardianName: string;
  guardianPhone: string;
  balance: number;
  createdAt: string;
}

export interface AdminSessionSummary {
  id: string;
  topic: string;
  status: string;
  startsAt: string;
  endsAt: string;
  className: string;
  courseName: string;
  teacherName: string;
  classroomName: string;
}

export interface AdminOverview {
  metrics: AdminMetricSummary;
  recentOrders: AdminOrderSummary[];
  recentStudents: AdminStudentSummary[];
  upcomingSessions: AdminSessionSummary[];
}

export interface AdminSearchResult {
  keyword: string;
  students: ParentChild[];
  guardians: Array<{ id: string; name: string; phone: string; createdAt: string }>;
  orders: Array<{
    id: string;
    orderNo: string;
    status: string;
    amountLabel: number;
    paidAmountLabel: number;
    studentName: string;
    courseName: string;
    createdAt: string;
  }>;
  courses: Course[];
}

export interface ParentChild {
  id: string;
  guardianId?: string | null;
  name: string;
  grade: string;
  school?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  enrollments?: Array<{
    id: string;
    classId: string;
    className: string;
    course?: { id: string; name: string; slug?: string | null } | null;
    campus?: { id: string; name: string } | null;
    teacher?: { id: string; name: string } | null;
  }>;
}

export interface ParentLessonAccount {
  id: string;
  studentId: string;
  courseId: string;
  balance: number;
  updatedAt: string;
  student?: ParentChild | null;
  course?: Course | null;
}

export interface ParentOrder {
  id: string;
  studentId?: string | null;
  courseId?: string | null;
  accountId?: string | null;
  packageId?: string | null;
  orderType?: 'package_purchase' | 'seat_reservation' | 'manual_package_grant' | string;
  orderNo: string;
  amount: number;
  paidAmount: number;
  lessonCount: number;
  currency: string;
  paymentProvider?: string | null;
  providerOrderId?: string | null;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | string;
  paidAt?: string | null;
  source: string;
  medium?: string | null;
  createdAt: string;
  updatedAt: string;
  student?: ParentChild | null;
  course?: Course | null;
  package?: CoursePackage | null;
}

export interface CheckoutPayload {
  order: ParentOrder;
  checkout: {
    loginIdentifier: string;
    defaultPassword: string | null;
    accountCreated: boolean;
    mustChangePassword: boolean;
    authToken?: string | null;
  };
}

export interface PaymentIntent {
  orderNo: string;
  provider: 'wechat_pay' | 'alipay' | 'mock' | string;
  amount: number;
  currency: string;
  mode: 'native_qr' | 'page_redirect' | 'mock_mini_program' | string;
  status: 'pending_payment' | 'paid';
  configured: boolean;
  integrationStatus: 'live' | 'mock' | 'not_configured' | string;
  nextAction: 'render_qr' | 'redirect' | 'mock_pay' | 'none' | string;
  nextStep: string;
  payload: Record<string, unknown>;
}

export interface ParentAttendance {
  id: string;
  studentId: string;
  status: string;
  lessonDelta: number;
  note?: string | null;
  createdAt: string;
  sessionId: string;
  startsAt: string;
  topic: string;
  courseId: string;
  className: string;
  courseName: string;
  student?: { id: string; name: string };
}

export interface ParentCheckInSession {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: string;
  student: { id: string; name: string; grade: string };
  class: { id: string; name: string };
  course: Course | null;
  classroom: { id: string; name: string } | null;
  checkedIn: boolean;
  attendanceStatus: string | null;
  canCheckIn: boolean;
}

export interface ParentCalendarEvent {
  id: string;
  sessionId: string;
  type: 'class_session';
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  student: { id: string; name: string; grade: string };
  class: { id: string; name: string };
  course: Course | null;
  classroom: { id: string; name: string } | null;
  checkedIn: boolean;
  attendanceStatus: string | null;
}

export interface PublicCalendarCourse {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
}

export interface PublicCalendarEvent {
  id: string;
  type: 'class_session' | 'trial_session';
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  sessionId?: string;
  trialSessionId?: string;
  class?: { id: string; name: string } | null;
  course: PublicCalendarCourse | null;
  teacher?: { id: string; name: string } | null;
  classroom?: { id: string; name: string } | null;
  campus?: { id: string; name: string; address?: string | null } | null;
  capacity?: number;
  bookedCount?: number;
  reservationFeeAmount?: number;
}

export interface ParentHomeworkCheckIn {
  id: string;
  accountId?: string | null;
  studentId: string;
  courseId?: string | null;
  classSessionId?: string | null;
  title: string;
  content: string;
  imageUrls: string[];
  reviewStatus: string;
  teacherFeedback: string;
  rating: number;
  reviewedByTeacherId?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; name: string } | null;
  course?: Course | null;
  session?: {
    id: string;
    startsAt: string;
    endsAt: string;
    topic: string;
    status: string;
  } | null;
  class?: { id: string; name: string } | null;
}

export interface ParentLessonFeedback {
  id: string;
  classSessionId: string;
  studentId: string;
  teacherId?: string | null;
  courseId?: string | null;
  classId?: string | null;
  content: string;
  rating: number;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
  student?: { id: string; name: string } | null;
  course?: Course | null;
  session?: {
    id: string;
    startsAt: string;
    endsAt: string;
    topic: string;
    status: string;
  } | null;
  class?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
  homeworkAssignment?: {
    id: string;
    content: string;
    studentId?: string | null;
    isPersonal: boolean;
  } | null;
}

export interface HomeworkAssignment {
  id: string;
  classSessionId: string;
  classId: string;
  courseId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  isPersonal?: boolean;
  student?: { id: string; name: string; grade?: string } | null;
  course?: Course | null;
  session?: {
    id: string;
    startsAt: string;
    endsAt: string;
    topic: string;
    status: string;
  } | null;
  class?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
}

export interface StudentWork {
  id: string;
  accountId?: string | null;
  studentId: string;
  courseId?: string | null;
  classId?: string | null;
  classSessionId?: string | null;
  teacherId?: string | null;
  title: string;
  description: string;
  imageUrls: string[];
  frameStyle: 'classic' | 'gallery' | 'paper' | string;
  source: 'parent' | 'teacher' | string;
  status: string;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; name: string; grade?: string } | null;
  course?: Course | null;
  session?: {
    id: string;
    startsAt: string;
    endsAt: string;
    topic: string;
    status: string;
  } | null;
  class?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
}

export interface CreateStudentWorkInput {
  studentId: string;
  courseId?: string | null;
  classId?: string | null;
  classSessionId?: string | null;
  title?: string;
  description?: string;
  imageUrls: string[];
  frameStyle?: 'classic' | 'gallery' | 'paper';
}

export interface ParentNotification {
  id: string;
  category: string;
  level: 'info' | 'success' | 'warning' | 'error' | string;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  meta?: Record<string, unknown>;
  status: 'unread' | 'read' | 'archived' | string;
  createdAt: string;
  updatedAt: string;
}

export type TeacherNotification = ParentNotification;

export interface AttendanceSummary {
  present: number;
  late: number;
  leave: number;
  absent: number;
  makeup: number;
  trial: number;
}

export interface TeacherClassSession {
  id: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: string;
  class?: { name: string };
  course?: { name: string };
  classroom?: { name: string };
  rosterCount?: number;
  attendanceCount?: number;
  attendanceSummary?: AttendanceSummary;
}

export interface TeacherClass {
  id: string;
  name: string;
  status: string;
  capacity: number;
  course?: { id: string; name: string };
  classroom?: { name: string };
  students: Array<{
    id: string;
    name: string;
    grade: string;
    school?: string | null;
    status?: string;
    lessonBalance?: number | null;
  }>;
}

export interface TeacherClassOption {
  id: string;
  name: string;
  status: string;
  capacity: number;
  enrolledCount: number;
  remainingSeats: number;
  alreadyEnrolled: boolean;
  canEnroll: boolean;
  disabledReason: string;
  course?: { id: string; name: string } | null;
  classroom?: { id?: string; name: string } | null;
}

export interface TeacherClassOptionsPayload {
  student: {
    id: string;
    name: string;
    grade: string;
    school?: string | null;
    status?: string;
  };
  lessonAccounts: Array<{
    id: string;
    studentId: string;
    courseId: string;
    balance: number;
    course?: Course | null;
  }>;
  classes: TeacherClassOption[];
}

export type AttendanceStatus = 'present' | 'late' | 'leave' | 'absent' | 'makeup' | 'trial';

export interface SessionAttendanceRecord {
  id: string;
  classSessionId: string;
  studentId: string;
  status: AttendanceStatus;
  lessonDelta: number;
  note: string | null;
}

export interface TeacherRosterStudent {
  id: string;
  name: string;
  grade: string;
}

export interface TeacherSessionAttendance {
  session: TeacherClassSession;
  class: { id: string; name: string } | null;
  roster: TeacherRosterStudent[];
  attendanceRecords: SessionAttendanceRecord[];
}

export interface TeacherCalendarEvent {
  id: string;
  type: 'class_session';
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  class: { id: string; name: string } | null;
  course: { id: string; name: string } | null;
  classroom: { id: string; name: string } | null;
  rosterCount: number;
  attendanceCount: number;
  attendanceSummary?: AttendanceSummary;
}

export interface TeacherHomeworkCheckIn extends ParentHomeworkCheckIn {
  student?: { id: string; name: string; grade: string } | null;
  reviewer?: { id: string; name: string } | null;
}

export interface TeacherLessonFeedback {
  id: string;
  classSessionId: string;
  studentId: string;
  teacherId?: string | null;
  courseId?: string | null;
  classId?: string | null;
  content: string;
  rating: number;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
  student?: { id: string; name: string; grade: string } | null;
  course?: Course | null;
  session?: TeacherClassSession | null;
  class?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
}

interface ApiErrorPayload {
  message?: string;
}

function buildQueryString(params: Record<string, string | number | undefined>) {
  const pairs = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export function getToken(): string {
  return String(wx.getStorageSync(TOKEN_KEY) || '');
}

export function hasToken(): boolean {
  return Boolean(getToken());
}

export function setToken(value: string): void {
  wx.setStorageSync(TOKEN_KEY, value);
}

export function clearToken(): void {
  wx.removeStorageSync(TOKEN_KEY);
}

export function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; data?: unknown } = {},
): Promise<T> {
  const authToken = getToken();
  const method = options.method ?? 'GET';
  const data = method === 'GET' ? options.data : (options.data ?? {});
  return new Promise((resolve, reject) => {
    wx.request<T | ApiErrorPayload>({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      success(result) {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as T);
          return;
        }
        const payload = result.data as ApiErrorPayload;
        reject(new Error(payload?.message || `请求失败：${result.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络请求失败'));
      },
    });
  });
}

export function loadHome(): Promise<HomePayload> {
  return request<HomePayload>('/public/home');
}

export function fetchStories(params: { limit?: number; offset?: number; search?: string } = {}) {
  return request<ContentListResponse>(`/public/stories${buildQueryString(params)}`);
}

export function fetchStory(slug: string) {
  return request<ContentItem>(`/public/stories/${encodeURIComponent(slug)}`);
}

export async function fetchCourses(): Promise<Course[]> {
  return (await request<{ courses: Course[] }>('/public/courses')).courses;
}

export function fetchCourse(slug: string): Promise<CourseDetail> {
  return request<CourseDetail>(`/public/courses/${encodeURIComponent(slug)}`);
}

export function fetchCampaignLanding(code: string): Promise<CampaignLandingPayload> {
  return request<CampaignLandingPayload>(`/public/campaigns/${encodeURIComponent(code)}`);
}

export async function fetchTrialSessions(): Promise<TrialSession[]> {
  return (await request<{ trialSessions: TrialSession[] }>('/public/trial-sessions')).trialSessions;
}

export function fetchTrialSession(id: string): Promise<TrialDetail> {
  return request<TrialDetail>(`/public/trial-sessions/${encodeURIComponent(id)}`);
}

export async function fetchPublicTeachers(): Promise<PublicTeacher[]> {
  return (await request<{ teachers: PublicTeacher[] }>('/public/teachers')).teachers;
}

export async function fetchPublicInstitutions(): Promise<PublicInstitution[]> {
  return (await request<{ institutions: PublicInstitution[] }>('/public/institutions'))
    .institutions;
}

export function fetchPublicTeacher(teacherId: string): Promise<PublicTeacherDetail> {
  return request<PublicTeacherDetail>(`/public/teachers/${encodeURIComponent(teacherId)}`);
}

export function submitCampaignParticipation(
  code: string,
  input: TrialRegistrationInput,
): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/public/crm/campaigns/${encodeURIComponent(code)}/participations`,
    {
      method: 'POST',
      data: input,
    },
  );
}

export function submitTrialRegistration(
  input: TrialRegistrationInput,
): Promise<{ message: string }> {
  return request<{ message: string }>('/public/trial-registrations', {
    method: 'POST',
    data: input,
  });
}

export function createSeatReservation(input: SeatReservationInput): Promise<{
  seatReservation: SeatReservation;
  order: ParentOrder;
  checkout?: {
    loginIdentifier: string;
    defaultPassword: string | null;
    accountCreated: boolean;
    authToken?: string | null;
  };
  message: string;
}> {
  return request('/public/seat-reservations', {
    method: 'POST',
    data: input,
  });
}

export async function fetchParentSeatReservations(): Promise<ParentSeatReservation[]> {
  return (
    await request<{ seatReservations: ParentSeatReservation[] }>('/public/me/seat-reservations')
  ).seatReservations;
}

export function rescheduleParentSeatReservation(
  seatReservationId: string,
  trialSessionId: string,
): Promise<{
  seatReservation: SeatReservation;
  previousTrialSession?: TrialSession | null;
  trialSession: TrialSession;
}> {
  return request(
    `/public/me/seat-reservations/${encodeURIComponent(seatReservationId)}/reschedule`,
    {
      method: 'POST',
      data: { trialSessionId },
    },
  );
}

export async function fetchWechatMiniSubscribeTemplates(): Promise<WechatMiniSubscribeTemplate[]> {
  return (
    await request<{ templates: WechatMiniSubscribeTemplate[] }>(
      '/public/wechat-mini/subscribe-templates',
    )
  ).templates;
}

export function createPublicOrder(input: CreateOrderInput): Promise<CheckoutPayload> {
  return request('/public/orders', {
    method: 'POST',
    data: input,
  });
}

export function completePackageOrderStudent(
  orderNo: string,
  input: { studentName: string; grade?: string },
): Promise<{ order: ParentOrder; student: ParentChild; message: string }> {
  return request(`/public/orders/${encodeURIComponent(orderNo)}/student`, {
    method: 'POST',
    data: input,
  });
}

export async function createPaymentIntent(
  orderNo: string,
  provider: 'wechat_pay' | 'alipay' | 'mock' = 'mock',
): Promise<PaymentIntent> {
  return (
    await request<{ item: PaymentIntent }>(
      `/public/orders/${encodeURIComponent(orderNo)}/payment-intent`,
      {
        method: 'POST',
        data: { provider },
      },
    )
  ).item;
}

export async function createWechatMiniPaymentIntent(orderNo: string): Promise<PaymentIntent> {
  return (
    await request<{ item: PaymentIntent }>(
      `/public/orders/${encodeURIComponent(orderNo)}/wechat-mini-payment-intent`,
      {
        method: 'POST',
      },
    )
  ).item;
}

export async function mockPayOrder(orderNo: string): Promise<ParentOrder> {
  return (
    await request<{ item: ParentOrder }>(`/public/orders/${encodeURIComponent(orderNo)}/mock-pay`, {
      method: 'POST',
    })
  ).item;
}

export async function syncOrderPayment(orderNo: string): Promise<ParentOrder> {
  return (
    await request<{ item: ParentOrder }>(
      `/public/orders/${encodeURIComponent(orderNo)}/payment-sync`,
      {
        method: 'POST',
      },
    )
  ).item;
}

export function wechatMiniLogin(
  code: string,
): Promise<
  { bound: true; token: string; account: AuthAccount } | { bound: false; bindToken: string }
> {
  return request('/auth/wechat-mini/login', {
    method: 'POST',
    data: { code },
  });
}

export function bindWechatMiniPhone(input: {
  bindToken: string;
  phone?: string;
  phoneCode?: string;
  displayName?: string;
}): Promise<{
  token: string;
  account: AuthAccount;
  accountCreated: boolean;
  defaultPassword: string | null;
}> {
  return request('/auth/wechat-mini/bind-phone', {
    method: 'POST',
    data: input,
  });
}

export function fetchMe(): Promise<{ account: AuthAccount | null }> {
  return request('/auth/me');
}

export function logout(): Promise<{ ok: boolean }> {
  return request('/auth/logout', { method: 'POST' });
}

export async function fetchParentChildren(): Promise<ParentChild[]> {
  return (await request<{ children: ParentChild[] }>('/public/me/children')).children;
}

export async function fetchParentLessonAccounts(): Promise<ParentLessonAccount[]> {
  return (await request<{ lessonAccounts: ParentLessonAccount[] }>('/public/me/lesson-accounts'))
    .lessonAccounts;
}

export async function fetchParentOrders(): Promise<ParentOrder[]> {
  return (await request<{ orders: ParentOrder[] }>('/public/me/orders')).orders;
}

export async function fetchParentAttendance(): Promise<ParentAttendance[]> {
  return (await request<{ attendance: ParentAttendance[] }>('/public/me/attendance')).attendance;
}

export async function fetchParentCheckInSessions(): Promise<ParentCheckInSession[]> {
  return (
    await request<{ checkInSessions: ParentCheckInSession[] }>('/public/me/check-in-sessions')
  ).checkInSessions;
}

export async function fetchParentCalendar(
  params: {
    from?: string;
    to?: string;
    studentId?: string;
  } = {},
): Promise<ParentCalendarEvent[]> {
  const query = Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return (
    await request<{ events: ParentCalendarEvent[] }>(
      `/public/me/calendar${query ? `?${query}` : ''}`,
    )
  ).events;
}

export async function fetchPublicCalendar(
  params: {
    from?: string;
    to?: string;
  } = {},
): Promise<PublicCalendarEvent[]> {
  return (
    await request<{ events: PublicCalendarEvent[] }>(`/public/calendar${buildQueryString(params)}`)
  ).events;
}

export function submitParentCheckIn(
  sessionId: string,
  studentId: string,
): Promise<{ attendanceRecord: unknown; message: string }> {
  return request(`/public/me/check-in-sessions/${encodeURIComponent(sessionId)}/check-in`, {
    method: 'POST',
    data: { studentId },
  });
}

export async function fetchParentHomeworkCheckIns(): Promise<ParentHomeworkCheckIn[]> {
  return (
    await request<{ homeworkCheckIns: ParentHomeworkCheckIn[] }>('/public/me/homework-check-ins')
  ).homeworkCheckIns;
}

export async function fetchParentHomeworkAssignments(): Promise<HomeworkAssignment[]> {
  return (
    await request<{ homeworkAssignments: HomeworkAssignment[] }>('/public/me/homework-assignments')
  ).homeworkAssignments;
}

export async function fetchParentLessonFeedbacks(): Promise<ParentLessonFeedback[]> {
  return (await request<{ lessonFeedbacks: ParentLessonFeedback[] }>('/public/me/lesson-feedbacks'))
    .lessonFeedbacks;
}

export function createParentHomeworkCheckIn(input: {
  studentId: string;
  courseId?: string | null;
  classSessionId?: string | null;
  title?: string;
  content: string;
  imageUrls?: string[];
}): Promise<{ homeworkCheckIn: ParentHomeworkCheckIn; message: string }> {
  return request('/public/me/homework-check-ins', {
    method: 'POST',
    data: input,
  });
}

export async function fetchParentStudentWorks(): Promise<StudentWork[]> {
  return (await request<{ studentWorks: StudentWork[] }>('/public/me/student-works')).studentWorks;
}

export async function fetchParentNotifications(): Promise<ParentNotification[]> {
  return (await request<{ notifications: ParentNotification[] }>('/public/me/notifications'))
    .notifications;
}

export async function markParentNotificationRead(
  notificationId: string,
): Promise<ParentNotification> {
  return (
    await request<{ notification: ParentNotification }>(
      `/public/me/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'POST' },
    )
  ).notification;
}

export interface ParentUploadToken {
  uploadToken: string;
  key: string;
  uploadHost: string;
  publicUrl: string;
  expiresIn: number;
}

export function createParentUploadToken(filename: string): Promise<ParentUploadToken> {
  return request<ParentUploadToken>('/public/me/upload-token', {
    method: 'POST',
    data: { filename },
  });
}

export function fetchAdminOverview(): Promise<AdminOverview> {
  return request('/public/admin/overview');
}

export function searchAdminData(keyword: string): Promise<AdminSearchResult> {
  return request(`/public/admin/search${buildQueryString({ q: keyword })}`);
}

export async function fetchTeacherDashboard(): Promise<{
  sessions: TeacherClassSession[];
  classes: TeacherClass[];
}> {
  return request('/public/teacher/dashboard');
}

export async function fetchTeacherNotifications(
  params: {
    status?: 'unread' | 'read' | 'archived';
    limit?: number;
  } = {},
): Promise<TeacherNotification[]> {
  return (
    await request<{ notifications: TeacherNotification[] }>(
      `/public/teacher/notifications${buildQueryString(params)}`,
    )
  ).notifications;
}

export async function markTeacherNotificationRead(
  notificationId: string,
): Promise<TeacherNotification> {
  return (
    await request<{ notification: TeacherNotification }>(
      `/public/teacher/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'POST' },
    )
  ).notification;
}

export function fetchTeacherStudentClassOptions(
  studentId: string,
  params: { courseId?: string } = {},
): Promise<TeacherClassOptionsPayload> {
  return request(
    `/public/teacher/students/${encodeURIComponent(studentId)}/class-options${buildQueryString(
      params,
    )}`,
  );
}

export function enrollTeacherStudent(
  studentId: string,
  input: { classId: string; notificationId?: string },
): Promise<{ enrollment: { id: string; classId: string; studentId: string; active: boolean } }> {
  return request(`/public/teacher/students/${encodeURIComponent(studentId)}/enrollments`, {
    method: 'POST',
    data: input,
  });
}

export async function fetchTeacherCalendar(params: { from?: string; to?: string } = {}) {
  const query = [
    params.from ? `from=${encodeURIComponent(params.from)}` : '',
    params.to ? `to=${encodeURIComponent(params.to)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  return (
    await request<{ events: TeacherCalendarEvent[] }>(
      `/public/teacher/calendar${query ? `?${query}` : ''}`,
    )
  ).events;
}

export async function fetchTeacherHomeworkCheckIns(): Promise<TeacherHomeworkCheckIn[]> {
  return (
    await request<{ homeworkCheckIns: TeacherHomeworkCheckIn[] }>(
      '/public/teacher/homework-check-ins',
    )
  ).homeworkCheckIns;
}

export async function fetchTeacherLessonFeedbacks(): Promise<TeacherLessonFeedback[]> {
  return (
    await request<{ lessonFeedbacks: TeacherLessonFeedback[] }>('/public/teacher/lesson-feedbacks')
  ).lessonFeedbacks;
}

export async function fetchTeacherHomeworkAssignments(): Promise<HomeworkAssignment[]> {
  return (
    await request<{ homeworkAssignments: HomeworkAssignment[] }>(
      '/public/teacher/homework-assignments',
    )
  ).homeworkAssignments;
}

export async function fetchTeacherStudentWorks(): Promise<StudentWork[]> {
  return (await request<{ studentWorks: StudentWork[] }>('/public/teacher/student-works'))
    .studentWorks;
}

export function createTeacherStudentWork(
  input: CreateStudentWorkInput,
): Promise<{ studentWork: StudentWork; message: string }> {
  return request('/public/teacher/student-works', {
    method: 'POST',
    data: input,
  });
}

export function createTeacherUploadToken(filename: string): Promise<ParentUploadToken> {
  return request<ParentUploadToken>('/public/teacher/upload-token', {
    method: 'POST',
    data: { filename },
  });
}

export function fetchTeacherSessionAttendance(
  sessionId: string,
): Promise<TeacherSessionAttendance> {
  return request(`/public/teacher/sessions/${encodeURIComponent(sessionId)}/attendance`);
}

export function recordTeacherAttendance(
  sessionId: string,
  records: Array<{ studentId: string; status: AttendanceStatus; note?: string }>,
): Promise<{ attendanceRecords: SessionAttendanceRecord[] }> {
  return request(`/public/teacher/sessions/${encodeURIComponent(sessionId)}/attendance`, {
    method: 'POST',
    data: { records },
  });
}

export function saveTeacherSessionFeedbacks(
  sessionId: string,
  input: {
    items: Array<{ studentId: string; content: string; rating: number; imageUrls?: string[] }>;
    classAssignmentContent?: string;
    studentAssignments?: Array<{ studentId: string; content: string }>;
  },
): Promise<{
  lessonFeedbacks: TeacherLessonFeedback[];
  homeworkAssignments: HomeworkAssignment[];
}> {
  return request(`/public/teacher/sessions/${encodeURIComponent(sessionId)}/feedbacks`, {
    method: 'POST',
    data: input,
  });
}

export function reviewTeacherHomeworkCheckIn(
  homeworkCheckInId: string,
  input: { reviewStatus: 'reviewed' | 'needs_revision'; teacherFeedback: string; rating: number },
): Promise<{ homeworkCheckIn: TeacherHomeworkCheckIn }> {
  return request(
    `/public/teacher/homework-check-ins/${encodeURIComponent(homeworkCheckInId)}/review`,
    {
      method: 'POST',
      data: input,
    },
  );
}
