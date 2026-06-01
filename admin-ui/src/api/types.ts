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
  slug: string;
  campusId?: string | null;
  name: string;
  category: string;
  ageRange: string;
  durationMinutes: number;
  status: string;
  summary: string;
  content?: string;
}

export interface CoursePackage {
  id: string;
  courseId?: string | null;
  name: string;
  description: string;
  lessonCount: number;
  priceAmount: number;
  status: string;
}

export interface Campus {
  id: string;
  name: string;
  address?: string | null;
}

export interface Teacher {
  id: string;
  name: string;
  phone?: string | null;
  specialties: string[];
  status: string;
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
  courseId?: string | null;
  trialSessionId?: string | null;
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
  status: string;
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

export type AttendanceStatus = 'present' | 'leave' | 'absent' | 'makeup' | 'trial';

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
  amount: number;
  paidAmount: number;
  lessonCount: number;
  status: string;
  createdAt: string;
  student?: { name: string };
  course?: { name: string };
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

export interface PublicProfile {
  headline: string;
  introduction: string;
  highlights: string[];
  promises: string[];
  bannerImageUrl: string;
  bannerTitle: string;
  bannerSubtitle: string;
  ctaText: string;
  ctaLink: string;
  stats: string[];
  testimonials: string[];
  gallery: string[];
  faq: string[];
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

export interface OrganizationSettings {
  id: string;
  name: string;
  brandName: string;
  phone: string | null;
  address: string | null;
  publicProfile: PublicProfile;
  branding: OrganizationBranding;
}

export interface SystemSettingOverview {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  values: Record<string, string | number | boolean>;
  secrets: Record<string, { configured: boolean }>;
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
