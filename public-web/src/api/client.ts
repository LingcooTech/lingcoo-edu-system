const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8090');
const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG ?? 'meizhi';

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
  tenant: {
    brandName: string;
    phone: string;
    address: string;
  };
  featuredCourses: Course[];
  trialSessions: TrialSession[];
}

export function getTenantSlug(): string {
  return TENANT_SLUG;
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
    `/public/${TENANT_SLUG}/auth/register`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  setParentToken(payload.token);
  return payload;
}

export async function parentLogin(email: string, password: string) {
  const payload = await publicApi<{ token: string; parent: ParentProfile }>(
    `/public/${TENANT_SLUG}/auth/login`,
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  setParentToken(payload.token);
  return payload;
}

export async function parentLogout() {
  await publicApi(`/public/${TENANT_SLUG}/auth/logout`, { method: 'POST' }).catch(
    () => undefined,
  );
  clearParentToken();
}

export async function fetchParentProfile(): Promise<ParentProfile | null> {
  if (!getParentToken()) {
    return null;
  }
  try {
    const payload = await publicApi<{ parent: ParentProfile | null }>(
      `/public/${TENANT_SLUG}/auth/me`,
    );
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
  return (await publicApi<{ children: ChildStudent[] }>(`/public/${TENANT_SLUG}/me/children`))
    .children;
}

export async function fetchParentLessonAccounts() {
  return (
    await publicApi<{ lessonAccounts: ParentLessonAccount[] }>(
      `/public/${TENANT_SLUG}/me/lesson-accounts`,
    )
  ).lessonAccounts;
}

export async function fetchParentOrders() {
  return (await publicApi<{ orders: ParentOrder[] }>(`/public/${TENANT_SLUG}/me/orders`)).orders;
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
    await publicApi<{ coursePackages: CoursePackage[] }>(
      `/public/${TENANT_SLUG}/course-packages`,
    )
  ).coursePackages;
}
