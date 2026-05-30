const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8090');

export interface Course {
  id: string;
  slug: string;
  name: string;
  category: string;
  ageRange: string;
  lessonCount: number;
  durationMinutes: number;
  priceAmount: number;
  summary: string;
  content?: string;
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

export interface HomePayload {
  organization: {
    name: string;
    brandName: string;
    phone: string | null;
    address: string | null;
    publicProfile: {
      headline: string;
      introduction: string;
      highlights: string[];
      promises: string[];
    };
  };
  campuses: Array<{
    id: string;
    name: string;
    address: string | null;
  }>;
  featuredCourses: Course[];
  trialSessions: TrialSession[];
}

const PARENT_TOKEN_KEY = 'fd_edu_parent_token';

export function getParentToken(): string | null {
  return localStorage.getItem(PARENT_TOKEN_KEY);
}

export function setParentToken(token: string): void {
  localStorage.setItem(PARENT_TOKEN_KEY, token);
}

export function clearParentToken(): void {
  localStorage.removeItem(PARENT_TOKEN_KEY);
}

export interface ParentProfile {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  emailVerified: boolean;
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
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function parentRegister(input: {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
}) {
  const payload = await publicApi<{ token: string; parent: ParentProfile }>(
    '/public/auth/register',
    { method: 'POST', body: JSON.stringify(input) },
  );
  setParentToken(payload.token);
  return payload;
}

export async function parentLogin(email: string, password: string) {
  const payload = await publicApi<{ token: string; parent: ParentProfile }>(
    '/public/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  setParentToken(payload.token);
  return payload;
}

export async function parentLogout() {
  await publicApi('/public/auth/logout', { method: 'POST' }).catch(() => undefined);
  clearParentToken();
}

export async function fetchParentProfile(): Promise<ParentProfile | null> {
  if (!getParentToken()) {
    return null;
  }
  try {
    const payload = await publicApi<{ parent: ParentProfile | null }>('/public/auth/me');
    return payload.parent;
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
  balance: number;
  student?: { name: string };
}

export interface ParentOrder {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  lessonCount: number;
  createdAt: string;
}

export async function fetchChildren() {
  return (await publicApi<{ children: ChildStudent[] }>('/public/me/children')).children;
}

export async function fetchParentLessonAccounts() {
  return (
    await publicApi<{ lessonAccounts: ParentLessonAccount[] }>(
      '/public/me/lesson-accounts',
    )
  ).lessonAccounts;
}

export async function fetchParentOrders() {
  return (await publicApi<{ orders: ParentOrder[] }>('/public/me/orders')).orders;
}

export interface CoursePackage {
  id: string;
  name: string;
  description: string;
  lessonCount: number;
  priceAmount: number;
}

export async function fetchCoursePackages() {
  return (
    await publicApi<{ coursePackages: CoursePackage[] }>('/public/course-packages')
  ).coursePackages;
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
}

export async function fetchCourse(slug: string) {
  return publicApi<CourseDetail>(`/public/courses/${slug}`);
}

export async function fetchTrialSessions() {
  return (
    await publicApi<{ trialSessions: TrialSession[] }>('/public/trial-sessions')
  ).trialSessions;
}

export interface TrialRegistrationInput {
  guardianName: string;
  phone: string;
  studentName: string;
  grade: string;
  courseId?: string;
  trialSessionId?: string;
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

export async function createOrder(packageId: string, studentId: string) {
  return (
    await publicApi<{ order: ParentOrder }>('/public/orders', {
      method: 'POST',
      body: JSON.stringify({ packageId, studentId }),
    })
  ).order;
}

export async function fetchPaymentProviders() {
  return (
    await publicApi<{ providers: PaymentProviderStatus[] }>('/public/payment-providers')
  ).providers;
}

export async function createPaymentIntent(orderNo: string, provider: PaymentProvider) {
  return (
    await publicApi<{ item: PaymentIntent }>(
      `/public/orders/${orderNo}/payment-intent`,
      { method: 'POST', body: JSON.stringify({ provider }) },
    )
  ).item;
}

export async function mockPayOrder(orderNo: string) {
  return (
    await publicApi<{ item: ParentOrder }>(`/public/orders/${orderNo}/mock-pay`, {
      method: 'POST',
    })
  ).item;
}

export interface PaymentSyncResult {
  changed: boolean;
  item: ParentOrder;
  reconciliation: { status: string; source: string; reason: string };
}

export async function syncPayment(orderNo: string) {
  return publicApi<PaymentSyncResult>(`/public/orders/${orderNo}/payment-sync`, {
    method: 'POST',
  });
}
