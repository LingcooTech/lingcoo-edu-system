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
  name: string;
  category: string;
  ageRange: string;
  lessonCount: number;
  durationMinutes: number;
  priceAmount: number;
  status: string;
  summary: string;
}

export interface CoursePackage {
  id: string;
  name: string;
  description: string;
  lessonCount: number;
  priceAmount: number;
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
  createdAt: string;
}

export interface TrialSession {
  id: string;
  title: string;
  courseId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
}

export interface Student {
  id: string;
  name: string;
  grade: string;
  status: string;
  guardian?: { name: string; phone: string };
  lessonAccounts?: Array<{ balance: number; courseId: string }>;
}

export interface ClassGroup {
  id: string;
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
