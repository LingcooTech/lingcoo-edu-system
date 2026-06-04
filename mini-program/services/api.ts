import type { Block } from '../utils/blocks';
import { API_BASE_URL, TOKEN_KEY } from './config';

export interface Course {
  id: string;
  slug: string;
  campusId?: string | null;
  name: string;
  category: string;
  ageRange: string;
  durationMinutes: number;
  packageCount?: number;
  startingPriceAmount?: number | null;
  summary: string;
  content?: string;
}

export interface CoursePackage {
  id: string;
  name: string;
  description: string;
  lessonCount: number;
  priceAmount: number;
}

export interface TrialSession {
  id: string;
  courseId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
}

export interface Organization {
  id: string;
  name: string;
  brandName: string;
  phone: string | null;
  address: string | null;
  publicProfile: {
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
    bodyBlocks?: Block[];
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
  }>;
  featuredCourses: Course[];
  trialSessions: TrialSession[];
}

export interface CourseDetail {
  course: Course;
  coursePackages: CoursePackage[];
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

export interface TrialRegistrationInput {
  guardianName: string;
  phone: string;
  studentName: string;
  grade: string;
  courseId?: string;
  trialSessionId?: string;
  source?: string;
  campaign?: string;
  course?: string;
  medium?: string;
}

export interface CreateOrderInput {
  packageId: string;
  guardianName?: string;
  guardianPhone: string;
  studentName: string;
  grade?: string;
  source?: string;
  campaign?: string;
  medium?: string;
}

export interface PublicTeacher {
  id: string;
  name: string;
  phone?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  specialties: string[];
  status: string;
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

export interface ParentChild {
  id: string;
  guardianId?: string | null;
  name: string;
  grade: string;
  school?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
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
  className: string;
  courseName: string;
  student?: { id: string; name: string };
}

export interface ParentNotification {
  id: string;
  category: string;
  level: 'info' | 'success' | 'warning' | 'error' | string;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  status: 'unread' | 'read' | 'archived' | string;
  createdAt: string;
  updatedAt: string;
}

interface ApiErrorPayload {
  message?: string;
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
  return new Promise((resolve, reject) => {
    wx.request<T | ApiErrorPayload>({
      url: `${API_BASE_URL}${path}`,
      method: options.method ?? 'GET',
      data: options.data,
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

export async function fetchCourses(): Promise<Course[]> {
  return (await request<{ courses: Course[] }>('/public/courses')).courses;
}

export function fetchCourse(slug: string): Promise<CourseDetail> {
  return request<CourseDetail>(`/public/courses/${encodeURIComponent(slug)}`);
}

export function fetchCampaignLanding(code: string): Promise<CampaignLandingPayload> {
  return request<CampaignLandingPayload>(`/public/campaigns/${encodeURIComponent(code)}`);
}

export async function fetchPublicTeachers(): Promise<PublicTeacher[]> {
  return (await request<{ teachers: PublicTeacher[] }>('/public/teachers')).teachers;
}

export function submitCampaignParticipation(
  code: string,
  input: TrialRegistrationInput,
): Promise<{ message: string }> {
  return request<{ message: string }>(`/public/crm/campaigns/${encodeURIComponent(code)}/participations`, {
    method: 'POST',
    data: input,
  });
}

export function submitTrialRegistration(input: TrialRegistrationInput): Promise<{ message: string }> {
  return request<{ message: string }>('/public/trial-registrations', {
    method: 'POST',
    data: input,
  });
}

export function createPublicOrder(input: CreateOrderInput): Promise<CheckoutPayload> {
  return request('/public/orders', {
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

export async function mockPayOrder(orderNo: string): Promise<ParentOrder> {
  return (
    await request<{ item: ParentOrder }>(`/public/orders/${encodeURIComponent(orderNo)}/mock-pay`, {
      method: 'POST',
    })
  ).item;
}

export function wechatMiniLogin(code: string): Promise<
  | { bound: true; token: string; account: AuthAccount }
  | { bound: false; bindToken: string }
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

export async function fetchParentNotifications(): Promise<ParentNotification[]> {
  return (await request<{ notifications: ParentNotification[] }>('/public/me/notifications'))
    .notifications;
}

export async function markParentNotificationRead(notificationId: string): Promise<ParentNotification> {
  return (
    await request<{ notification: ParentNotification }>(
      `/public/me/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'POST' },
    )
  ).notification;
}
