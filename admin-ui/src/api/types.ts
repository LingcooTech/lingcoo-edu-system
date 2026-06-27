import type { Block } from '@/components/editor/blocks';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'trial_booked'
  | 'trial_attended'
  | 'paid'
  | 'follow_up'
  | 'course_delivery'
  | 'invalid';

export interface Course {
  id: string;
  courseSeriesId?: string | null;
  slug: string;
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
  status: string;
  summary: string;
  content?: string;
}

export interface CourseSeries {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  sortOrder: number;
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
  status: string;
}

export interface Campus {
  id: string;
  name: string;
  address?: string | null;
  environmentImageUrls: string[];
}

export interface Teacher {
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

export interface Institution {
  id: string;
  name: string;
  logoUrl?: string | null;
  intro?: string | null;
  qualificationItems?: InstitutionMediaItem[];
  outcomeItems?: InstitutionMediaItem[];
  contact?: string | null;
  sortOrder: number;
  status: string;
}

export interface InstitutionMediaItem {
  imageUrl: string;
  caption: string;
}

export interface Guardian {
  id: string;
  name: string;
  phone: string;
}

export type AccountRole = 'admin' | 'teacher' | 'parent';

export interface Account {
  id: string;
  role: AccountRole;
  email?: string | null;
  phone?: string | null;
  displayName: string;
  status: 'active' | 'suspended';
  mustChangePassword: boolean;
  emailVerified: boolean;
  guardianId?: string | null;
  teacherId?: string | null;
  guardian?: Guardian;
  teacher?: Teacher;
  createdAt: string;
}

export interface Classroom {
  id: string;
  campusId: string;
  name: string;
  capacity: number;
  status: string;
}

export interface Lead {
  id: string;
  guardianName: string;
  phone: string;
  studentName: string;
  grade: string;
  status: LeadStatus;
  source: string;
  campusId?: string | null;
  courseId?: string | null;
  trialSessionId?: string | null;
  preferredTeacherId?: string | null;
  channelId?: string | null;
  campaignId?: string | null;
  medium?: string | null;
  nextFollowUpAt?: string | null;
  convertedStudentId?: string | null;
  createdAt: string;
}

export interface FollowUp {
  id: string;
  content: string;
  nextFollowUpAt?: string | null;
  createdAt: string;
}

export interface Channel {
  id: string;
  code: string;
  name: string;
}

export interface Campaign {
  id: string;
  channelId: string;
  code: string;
  name: string;
  courseSlug?: string | null;
  medium: string;
  status: string;
  content?: string;
}

export interface CampaignFunnelRow {
  campaignId: string;
  code: string;
  name: string;
  channelCode: string | null;
  channelName: string | null;
  courseSlug?: string | null;
  medium: string;
  status: string;
  total: number;
  new: number;
  contacted: number;
  trialBooked: number;
  trialAttended: number;
  paid: number;
  conversionRate: number;
}

export interface ChannelFunnelRow {
  channelId: string;
  code: string;
  name: string;
  total: number;
  new: number;
  contacted: number;
  trialBooked: number;
  trialAttended: number;
  paid: number;
  conversionRate: number;
}

export interface TrialSession {
  id: string;
  title: string;
  campusId: string;
  courseId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  reservationFeeAmount: number;
  reservationNotice: string;
  coverImageUrl?: string | null;
  status: string;
}

export interface SeatReservation {
  id: string;
  orderNo: string;
  leadId?: string | null;
  campusId?: string | null;
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
  checkedInAt?: string | null;
  rescheduledAt?: string | null;
  source: string;
  medium?: string | null;
  createdAt: string;
}

export interface Student {
  id: string;
  guardianId?: string | null;
  name: string;
  grade: string;
  school?: string | null;
  status: string;
  guardian?: { name: string; phone: string };
  lessonAccounts?: Array<{ balance: number; courseId: string }>;
}

export interface ClassGroup {
  id: string;
  campusId: string;
  courseId: string;
  teacherId: string;
  classroomId: string;
  name: string;
  status: string;
  capacity: number;
  enrolledCount: number;
  course?: Course;
  teacher?: { name: string };
  classroom?: { name: string };
}

export interface ClassSession {
  id: string;
  classId: string;
  teacherId: string;
  classroomId: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: string;
  class?: { name: string };
  teacher?: { name: string };
  classroom?: { name: string };
}

export interface CalendarEvent {
  id: string;
  type: 'class_session';
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  class?: { id: string; name: string } | null;
  course?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
  classroom?: { id: string; name: string } | null;
}

export type AttendanceStatus = 'present' | 'late' | 'leave' | 'absent' | 'makeup' | 'trial';

export interface AttendanceRecord {
  id: string;
  classSessionId: string;
  studentId: string;
  status: AttendanceStatus;
  lessonDelta: number;
  note?: string | null;
}

export interface LessonAccount {
  id: string;
  balance: number;
  student?: { name: string; grade: string };
  course?: { name: string };
}

export interface Order {
  id: string;
  orderNo: string;
  orderType?: 'package_purchase' | 'seat_reservation' | 'manual_package_grant' | string;
  amount: number;
  paidAmount: number;
  lessonCount: number;
  currency?: string;
  paymentProvider?: string | null;
  providerOrderId?: string | null;
  paymentReceiverType?: 'platform' | 'provider' | 'other' | string;
  paymentReceiverInstitutionId?: string | null;
  paymentReceiverName?: string | null;
  paymentMethod?: string | null;
  offlinePaymentNote?: string | null;
  status: string;
  paidAt?: string | null;
  cancelReason?:
    | 'user_cancel'
    | 'system_cancel'
    | 'admin_invalid'
    | 'test_order'
    | 'duplicate'
    | 'other'
    | null;
  cancelledByAdminId?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  student?: { name: string };
  course?: { name: string };
  package?: {
    name: string;
    lessonCount: number;
    giftedLessonCount?: number;
    priceAmount: number;
    discountPriceAmount?: number | null;
  };
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

export interface CourseContractPaymentRecord {
  id: string;
  courseContractId: string;
  orderId?: string | null;
  paidAmount: number;
  paymentMethod?: string | null;
  paidAt: string;
  note?: string | null;
  createdByAccountId?: string | null;
  createdAt: string;
}

export interface CourseContractGift {
  id: string;
  courseContractId: string;
  studentId: string;
  courseId: string;
  classId?: string | null;
  title: string;
  lessonCount: number;
  reason: string;
  startsAt?: string | null;
  endsAt?: string | null;
  status: 'active' | 'completed' | 'cancelled' | string;
  note?: string | null;
  createdByAccountId?: string | null;
  createdAt: string;
  updatedAt: string;
  course?: Course;
  class?: ClassGroup;
}

export interface CourseContract {
  id: string;
  studentId: string;
  courseId: string;
  classId?: string | null;
  packageId?: string | null;
  orderId?: string | null;
  contractNo: string;
  title: string;
  lessonCount: number;
  paidAmount: number;
  paymentMethod?: string | null;
  paymentReceiverType: 'platform' | 'provider' | 'other' | string;
  paymentReceiverInstitutionId?: string | null;
  paymentReceiverName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status: 'active' | 'completed' | 'cancelled' | string;
  note?: string | null;
  createdByAccountId?: string | null;
  createdAt: string;
  updatedAt: string;
  student?: Student;
  course?: Course;
  class?: ClassGroup;
  package?: CoursePackage;
  order?: Order;
  paymentRecords: CourseContractPaymentRecord[];
  gifts?: CourseContractGift[];
}

export interface SettlementBatchOrder {
  id: string;
  settlementBatchId: string;
  orderId: string;
  amount: number;
  createdAt: string;
  order?: Order | null;
}

export interface SettlementBatch {
  id: string;
  paymentReceiverType: 'platform' | 'provider' | 'other' | string;
  paymentReceiverInstitutionId?: string | null;
  paymentReceiverName: string;
  startsAt?: string | null;
  endsAt?: string | null;
  orderCount: number;
  totalAmount: number;
  status: 'settled' | 'voided' | string;
  note?: string | null;
  createdByAccountId?: string | null;
  settledAt: string;
  voidedAt?: string | null;
  createdAt: string;
  orders: SettlementBatchOrder[];
}

export interface PaymentProviderItem {
  code: 'wechat_pay' | 'alipay' | 'mock';
  label: string;
  source: 'database' | 'env' | 'none';
  configured: boolean;
  supportedModes: string[];
  notifyUrl?: string;
  values: Record<string, string | boolean>;
  secrets: Record<string, { configured: boolean }>;
}

export interface PaymentProviderOverview {
  items: PaymentProviderItem[];
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

export interface PublicProfile {
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
}

export interface OrganizationBranding {
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
  headingFont?: string;
  bodyFont?: string;
  radius?: string;
}

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
  aboutPage: AboutPageSettings;
  icpNumber: string;
  icpUrl: string;
}

export interface BusinessModelSettings {
  onlinePackageSalesEnabled: boolean;
  manualPackageGrantEnabled: boolean;
  packagePriceDisplayEnabled: boolean;
  seatReservationFeeEnabled: boolean;
  courseContractEditEnabled: boolean;
}

export interface OrganizationSettings {
  id: string;
  name: string;
  brandName: string;
  phone: string | null;
  address: string | null;
  publicProfile: PublicProfile;
  publicSite: PublicSiteSettings;
  businessModel: BusinessModelSettings;
  branding: OrganizationBranding;
}

export interface SystemSettingOverview {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  values: Record<string, string | number | boolean>;
  secrets: Record<string, { configured: boolean }>;
}

export interface ContentImportSettingsOverview {
  configured: boolean;
  source: 'database' | 'none';
  values: {
    wordpress: {
      siteUrl: string;
      username: string;
    };
    notion: Record<string, never>;
  };
  secrets: {
    wordpress: {
      appPassword: { configured: boolean };
    };
    notion: {
      apiToken: { configured: boolean };
    };
  };
}

export interface ContentImportSettingsInput {
  wordpress?: {
    siteUrl?: string;
    username?: string;
    appPassword?: string;
  };
  notion?: {
    apiToken?: string;
  };
}

export interface ContentImportWordPressTestResult {
  ok: true;
  provider: 'wordpress';
  siteUrl: string;
  mode: 'authenticated' | 'public';
  account: string | null;
}

export interface ContentImportNotionTestResult {
  ok: true;
  provider: 'notion';
  workspace: string | null;
  userName: string | null;
}

export interface WechatPaymentSettingsInput {
  appId?: string;
  appSecret?: string;
  mchId?: string;
  apiKey?: string;
  disableH5?: boolean;
  notifyUrl?: string;
}

export interface AlipayPaymentSettingsInput {
  appId?: string;
  gateway?: string;
  notifyUrl?: string;
  returnUrl?: string;
  keyType?: 'PKCS1' | 'PKCS8';
  f2fPay?: boolean;
  privateKeyPem?: string;
  publicKeyPem?: string;
}

export interface SmtpSettingsInput {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  from?: string;
}

export interface QiniuSettingsInput {
  accessKey?: string;
  secretKey?: string;
  bucketName?: string;
  publicBaseUrl?: string;
  uploadHost?: string;
  defaultPrefix?: string;
}

export interface QiniuImageItem {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string | null;
}

export interface QiniuImageListResponse {
  items: QiniuImageItem[];
  marker: string | null;
  hasMore: boolean;
  prefix: string;
  limit: number;
}

export interface QiniuUploadTokenResponse {
  uploadToken: string;
  key: string;
  uploadHost: string;
  publicUrl: string;
  expiresIn: number;
}

export interface QiniuUploadedImageResponse {
  key: string;
  url: string;
  publicUrl: string;
}
