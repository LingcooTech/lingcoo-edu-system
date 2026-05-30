export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'trial_booked'
  | 'trial_attended'
  | 'paid'
  | 'follow_up'
  | 'invalid';

export interface Course {
  id: string;
  slug: string;
  campusId?: string | null;
  name: string;
  category: string;
  ageRange: string;
  lessonCount: number;
  durationMinutes: number;
  priceAmount: number;
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

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  phone: string;
  address: string;
  status: string;
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

export interface TenantPublicProfile {
  headline: string;
  introduction: string;
  highlights: string[];
  promises: string[];
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
