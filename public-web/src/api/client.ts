import type { Block } from '@/components/blocks/blocks';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8090');

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
  onlineSalesEnabled?: boolean;
  packageCount?: number;
  startingPriceAmount?: number | null;
  summary: string;
  content?: string;
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
  authorName: string | null;
  sourceType: ContentSourceType;
  sourceId: string | null;
  sourceUrl: string | null;
  status: ContentStatus;
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

export interface HomePayload {
  organization: {
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
    publicSite: {
      navigation: Array<{
        label: string;
        path: string;
        visible: boolean;
      }>;
      pages: PublicSitePageCopies;
      aboutPage: {
        eyebrow: string;
        title: string;
        subtitle: string;
        seoTitle: string;
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
    businessModel: BusinessModelSettings;
    branding: {
      fullLogoUrl?: string;
      squareLogoUrl?: string;
      logoUrl?: string;
      darkLogoUrl?: string;
      faviconUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      backgroundColor?: string;
      cardColor?: string;
      textColor?: string;
    };
  };
  campuses: Array<{
    id: string;
    name: string;
    address: string | null;
  }>;
  teachers: PublicTeacher[];
  featuredCourses: Course[];
  trialSessions: TrialSession[];
  contentItems: ContentItem[];
}

// Unified identity: one token + one cookie (`fd_edu_token`) shared with /admin
// under the same origin. localStorage caches the token for Bearer auth; the
// httpOnly cookie set on login is what /admin reads.
const AUTH_TOKEN_KEY = 'fd_edu_token';

export function getParentToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setParentToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearParentToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export type AccountRole = 'admin' | 'teacher' | 'parent';

export interface AuthAccount {
  id: string;
  role: AccountRole;
  email: string | null;
  displayName: string;
  phone: string | null;
  emailVerified: boolean;
  mustChangePassword: boolean;
}

export async function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getParentToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

// --- Unified auth (login accepts email OR phone as identifier) ---

export async function parentRegister(input: {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
}) {
  const payload = await publicApi<{ token: string; account: AuthAccount }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setParentToken(payload.token);
  return payload;
}

export async function parentLogin(identifier: string, password: string) {
  const payload = await publicApi<{ token: string; account: AuthAccount }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
  setParentToken(payload.token);
  return payload;
}

export async function parentLogout() {
  await publicApi('/auth/logout', { method: 'POST' }).catch(() => undefined);
  clearParentToken();
}

export async function changeParentPassword(currentPassword: string, newPassword: string) {
  return publicApi<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchParentProfile(): Promise<AuthAccount | null> {
  if (!getParentToken()) {
    return null;
  }
  try {
    const payload = await publicApi<{ account: AuthAccount | null }>('/auth/me');
    return payload.account;
  } catch {
    clearParentToken();
    return null;
  }
}

export interface ChildStudent {
  id: string;
  name: string;
  grade: string;
  school: string | null;
}

export interface ParentLessonAccount {
  id: string;
  studentId: string;
  courseId: string;
  balance: number;
  student?: { id: string; name: string };
  course?: Course | null;
}

export interface ParentOrder {
  id: string;
  orderNo: string;
  orderType?: string;
  amount: number;
  paidAmount?: number;
  status: string;
  lessonCount: number;
  currency?: string;
  paymentProvider?: string | null;
  providerOrderId?: string | null;
  createdAt: string;
  course?: Course | null;
  package?: CoursePackage | null;
  refundRequests?: RefundRequest[];
}

export interface RefundRequest {
  id: string;
  orderId: string;
  orderNo: string;
  accountId?: string | null;
  amount: number;
  reason:
    | 'schedule_conflict'
    | 'course_not_fit'
    | 'duplicate_payment'
    | 'service_issue'
    | 'other'
    | string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | string;
  buyerNote?: string | null;
  adminNote?: string | null;
  decidedByAccountId?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutInfo {
  loginIdentifier: string;
  defaultPassword: string | null;
  accountCreated: boolean;
  mustChangePassword: boolean;
}

export async function fetchChildren() {
  return (await publicApi<{ children: ChildStudent[] }>('/public/me/children')).children;
}

export async function fetchParentLessonAccounts() {
  return (await publicApi<{ lessonAccounts: ParentLessonAccount[] }>('/public/me/lesson-accounts'))
    .lessonAccounts;
}

export async function fetchParentOrders() {
  return (await publicApi<{ orders: ParentOrder[] }>('/public/me/orders')).orders;
}

export async function applyOrderRefund(
  orderNo: string,
  input: {
    reason:
      | 'schedule_conflict'
      | 'course_not_fit'
      | 'duplicate_payment'
      | 'service_issue'
      | 'other';
    buyerNote?: string;
  },
) {
  return (
    await publicApi<{ refund: RefundRequest }>(
      `/public/me/orders/${encodeURIComponent(orderNo)}/refund`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  ).refund;
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
}

export interface PublicClassroom {
  id: string;
  campusId: string;
  name: string;
  capacity: number;
  status: string;
}

export async function fetchCoursePackages() {
  return (await publicApi<{ coursePackages: CoursePackage[] }>('/public/course-packages'))
    .coursePackages;
}

// --- Acquisition funnel: course browsing + trial registration (no login) ---

// The home payload feeds the homepage, the shared Layout (brand/contact) and
// the About page, so it is fetched once and shared.
let homeCache: Promise<HomePayload> | null = null;

export function loadHome(): Promise<HomePayload> {
  if (!homeCache) {
    homeCache = publicApi<HomePayload>('/public/home');
  }
  return homeCache;
}

export async function fetchCourses() {
  return (await publicApi<{ courses: Course[] }>('/public/courses')).courses;
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
  businessModel: BusinessModelSettings;
}

export async function fetchCourse(slug: string) {
  return publicApi<CourseDetail>(`/public/courses/${slug}`);
}

export async function fetchTrialSessions() {
  return (await publicApi<{ trialSessions: TrialSession[] }>('/public/trial-sessions'))
    .trialSessions;
}

function buildQueryString(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }
  const query = qs.toString();
  return query ? `?${query}` : '';
}

export async function fetchStories(
  params: { limit?: number; offset?: number; search?: string } = {},
) {
  return publicApi<ContentListResponse>(`/public/stories${buildQueryString(params)}`);
}

export async function fetchStory(slug: string) {
  return publicApi<ContentItem>(`/public/stories/${encodeURIComponent(slug)}`);
}

export interface TrialDetail {
  trialSession: TrialSession;
  course: Course;
  campus: { id: string; name: string; address: string | null } | null;
  organization: HomePayload['organization'];
}

export async function fetchTrialSession(id: string) {
  return publicApi<TrialDetail>(`/public/trial-sessions/${id}`);
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
  organization: HomePayload['organization'];
}

export async function fetchCampaignLanding(code: string) {
  return publicApi<CampaignLandingPayload>(`/public/campaigns/${code}`);
}

export interface TrialRegistrationInput {
  guardianName: string;
  phone: string;
  studentName: string;
  grade: string;
  campusId?: string;
  courseId?: string;
  trialSessionId?: string;
  preferredTeacherId?: string;
  // Attribution forwarded from the scanned QR landing URL.
  source?: string;
  campaign?: string;
  course?: string;
  medium?: string;
}

export async function submitTrialRegistration(input: TrialRegistrationInput) {
  return publicApi<{ message: string }>('/public/trial-registrations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

export async function createSeatReservation(
  input: Omit<TrialRegistrationInput, 'courseId'> & {
    trialSessionId: string;
  },
) {
  return publicApi<{
    seatReservation: SeatReservation;
    order: ParentOrder;
    message: string;
  }>('/public/seat-reservations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchParentSeatReservations() {
  return (
    await publicApi<{ seatReservations: ParentSeatReservation[] }>('/public/me/seat-reservations')
  ).seatReservations;
}

export async function rescheduleParentSeatReservation(
  seatReservationId: string,
  trialSessionId: string,
) {
  return publicApi<{
    seatReservation: SeatReservation;
    previousTrialSession?: TrialSession | null;
    trialSession: TrialSession;
  }>(`/public/me/seat-reservations/${seatReservationId}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ trialSessionId }),
  });
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
  attendanceStatus: AttendanceStatus | null;
  canCheckIn: boolean;
}

export async function fetchParentCheckInSessions() {
  return (
    await publicApi<{ checkInSessions: ParentCheckInSession[] }>('/public/me/check-in-sessions')
  ).checkInSessions;
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
  attendanceStatus: AttendanceStatus | null;
}

export async function fetchParentCalendar(
  params: {
    from?: string;
    to?: string;
    studentId?: string;
  } = {},
) {
  return (
    await publicApi<{ events: ParentCalendarEvent[] }>(
      `/public/me/calendar${buildQueryString(params)}`,
    )
  ).events;
}

export async function submitParentCheckIn(sessionId: string, studentId: string) {
  return publicApi<{ attendanceRecord: SessionAttendanceRecord | null; message: string }>(
    `/public/me/check-in-sessions/${sessionId}/check-in`,
    { method: 'POST', body: JSON.stringify({ studentId }) },
  );
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
  reviewedByTeacherId?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; name: string } | null;
  course?: Course | null;
  session?: TeacherClassSession | null;
  class?: { id: string; name: string } | null;
}

export interface TeacherHomeworkCheckIn extends ParentHomeworkCheckIn {
  student?: { id: string; name: string; grade: string } | null;
  reviewer?: { id: string; name: string } | null;
}

export async function fetchParentHomeworkCheckIns() {
  return (
    await publicApi<{ homeworkCheckIns: ParentHomeworkCheckIn[] }>('/public/me/homework-check-ins')
  ).homeworkCheckIns;
}

export async function createParentHomeworkCheckIn(input: {
  studentId: string;
  courseId?: string | null;
  classSessionId?: string | null;
  title?: string;
  content: string;
  imageUrls?: string[];
}) {
  return publicApi<{ homeworkCheckIn: ParentHomeworkCheckIn; message: string }>(
    '/public/me/homework-check-ins',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function fetchTeacherHomeworkCheckIns() {
  return (
    await publicApi<{ homeworkCheckIns: TeacherHomeworkCheckIn[] }>(
      '/public/teacher/homework-check-ins',
    )
  ).homeworkCheckIns;
}

export async function reviewTeacherHomeworkCheckIn(
  homeworkCheckInId: string,
  input: { reviewStatus: 'reviewed' | 'needs_revision'; teacherFeedback: string },
) {
  return publicApi<{ homeworkCheckIn: TeacherHomeworkCheckIn }>(
    `/public/teacher/homework-check-ins/${homeworkCheckInId}/review`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function submitCampaignParticipation(code: string, input: TrialRegistrationInput) {
  return publicApi<{ message: string }>(`/public/crm/campaigns/${code}/participations`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
  status: string;
}

export interface PublicInstitution {
  id: string;
  name: string;
  logoUrl?: string | null;
  intro?: string | null;
  qualificationItems?: InstitutionMediaItem[];
  outcomeItems?: InstitutionMediaItem[];
  contact?: string | null;
  sortOrder?: number;
}

export interface InstitutionMediaItem {
  imageUrl: string;
  caption: string;
}

export interface PublicInstitutionDetail {
  institution: PublicInstitution;
  teachers: PublicTeacher[];
  courses: Course[];
  businessModel: BusinessModelSettings;
}

export interface PublicTeacherDetail {
  teacher: PublicTeacher;
  institution: { id: string; name: string; logoUrl?: string | null } | null;
  courses: Course[];
}

export async function fetchPublicTeachers() {
  return (await publicApi<{ teachers: PublicTeacher[] }>('/public/teachers')).teachers;
}

export async function fetchPublicInstitutions() {
  return (await publicApi<{ institutions: PublicInstitution[] }>('/public/institutions'))
    .institutions;
}

export async function fetchPublicInstitution(institutionId: string) {
  return publicApi<PublicInstitutionDetail>(
    `/public/institutions/${encodeURIComponent(institutionId)}`,
  );
}

export async function fetchPublicTeacher(teacherId: string) {
  return publicApi<PublicTeacherDetail>(`/public/teachers/${teacherId}`);
}

// --- Checkout / payment ---

export type PaymentProvider = 'wechat_pay' | 'alipay' | 'mock';

export interface PaymentProviderStatus {
  code: PaymentProvider;
  label: string;
  configured: boolean;
  supportedModes: string[];
}

export interface PaymentIntent {
  orderNo: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  mode: 'native_qr' | 'page_redirect' | 'mock_mini_program';
  status: 'pending_payment' | 'paid';
  configured: boolean;
  integrationStatus: 'live' | 'mock' | 'not_configured';
  nextAction: 'render_qr' | 'redirect' | 'mock_pay' | 'none';
  nextStep: string;
  payload: {
    qrCodeDataUrl?: string;
    qrCodeText?: string;
    checkoutUrl?: string;
    [key: string]: unknown;
  };
}

export interface CreateOrderInput {
  packageId: string;
  courseId?: string;
  guardianName?: string;
  guardianPhone: string;
  studentName: string;
  grade?: string;
  source?: string;
  campaign?: string;
  medium?: string;
}

export async function createOrder(input: CreateOrderInput) {
  return await publicApi<{ order: ParentOrder; checkout: CheckoutInfo }>('/public/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchPaymentProviders() {
  return (await publicApi<{ providers: PaymentProviderStatus[] }>('/public/payment-providers'))
    .providers;
}

export async function createPaymentIntent(orderNo: string, provider: PaymentProvider) {
  return (
    await publicApi<{ item: PaymentIntent }>(
      `/public/orders/${encodeURIComponent(orderNo)}/payment-intent`,
      {
        method: 'POST',
        body: JSON.stringify({ provider }),
      },
    )
  ).item;
}

export async function mockPayOrder(orderNo: string) {
  return (
    await publicApi<{ item: ParentOrder }>(
      `/public/orders/${encodeURIComponent(orderNo)}/mock-pay`,
      {
        method: 'POST',
      },
    )
  ).item;
}

export async function fetchOrderStatus(orderNo: string) {
  return (
    await publicApi<{ item: ParentOrder }>(`/public/orders/${encodeURIComponent(orderNo)}/status`)
  ).item;
}

export interface PaymentSyncResult {
  changed: boolean;
  item: ParentOrder;
  reconciliation: { status: string; source: string; reason: string };
}

export async function syncPayment(orderNo: string) {
  return publicApi<PaymentSyncResult>(
    `/public/orders/${encodeURIComponent(orderNo)}/payment-sync`,
    {
      method: 'POST',
    },
  );
}

// --- Teacher front-office read-only views ---

export interface TeacherClassSession {
  id: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: string;
  class?: { name: string };
  course?: { name: string };
  classroom?: { name: string };
}

export interface TeacherClass {
  id: string;
  name: string;
  status: string;
  capacity: number;
  course?: { name: string };
  classroom?: { name: string };
  students: Array<{ id: string; name: string; grade: string }>;
}

export async function fetchTeacherDashboard() {
  return publicApi<{
    sessions: TeacherClassSession[];
    classes: TeacherClass[];
  }>('/public/teacher/dashboard');
}

export type AttendanceStatus = 'present' | 'leave' | 'absent' | 'makeup' | 'trial';

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

export async function fetchTeacherSessionAttendance(sessionId: string) {
  return publicApi<TeacherSessionAttendance>(`/public/teacher/sessions/${sessionId}/attendance`);
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
}

export async function fetchTeacherCalendar(params: { from?: string; to?: string } = {}) {
  return (
    await publicApi<{ events: TeacherCalendarEvent[] }>(
      `/public/teacher/calendar${buildQueryString(params)}`,
    )
  ).events;
}

export async function recordTeacherAttendance(
  sessionId: string,
  records: Array<{ studentId: string; status: AttendanceStatus; note?: string }>,
) {
  return publicApi<{ attendanceRecords: SessionAttendanceRecord[] }>(
    `/public/teacher/sessions/${sessionId}/attendance`,
    { method: 'POST', body: JSON.stringify({ records }) },
  );
}

// --- Parent: children attendance history (签到记录) ---

export interface ParentAttendanceRecord {
  id: string;
  studentId: string;
  status: AttendanceStatus;
  lessonDelta: number;
  note: string | null;
  createdAt: string;
  sessionId: string;
  startsAt: string;
  topic: string;
  className: string;
  courseName: string;
  student?: { id: string; name: string };
}

export async function fetchParentAttendance() {
  return (await publicApi<{ attendance: ParentAttendanceRecord[] }>('/public/me/attendance'))
    .attendance;
}

// --- Public QR check-in (no login required) ---

export interface PublicCheckInStudent {
  id: string;
  name: string;
  grade: string;
  checkedIn: boolean;
  attendanceStatus: AttendanceStatus | null;
}

export interface PublicCheckInPayload {
  session: {
    id: string;
    startsAt: string;
    endsAt: string;
    topic: string;
    status: string;
  };
  class: { id: string; name: string };
  course: { id: string; name: string };
  classroom: { id: string; name: string } | null;
  roster: PublicCheckInStudent[];
}

export async function fetchPublicCheckIn(sessionId: string) {
  return publicApi<PublicCheckInPayload>(`/public/class-sessions/${sessionId}/check-in`);
}

export async function submitPublicCheckIn(sessionId: string, studentId: string) {
  return publicApi<{ attendanceRecord: SessionAttendanceRecord | null; message: string }>(
    `/public/class-sessions/${sessionId}/check-in`,
    { method: 'POST', body: JSON.stringify({ studentId }) },
  );
}
