import type {
  AlipayPaymentSettingsInput,
  OrganizationSettings,
  PaymentProviderOverview,
  QiniuSettingsInput,
  SmtpSettingsInput,
  SystemSettingOverview,
  WechatPaymentSettingsInput,
} from './types';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8090');

export function getToken(): string | null {
  return localStorage.getItem('fd_edu_token');
}

export function setToken(token: string): void {
  localStorage.setItem('fd_edu_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('fd_edu_token');
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
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

// Generic write helpers reused by resource CRUD pages (courses, campaigns, …).
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}

export async function login(email: string, password: string) {
  const payload = await api<{ token: string; user: unknown }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(payload.token);
  return payload;
}

export async function fetchPaymentSettings() {
  return api<PaymentProviderOverview>('/v1/payment-settings');
}

export async function fetchOrganization() {
  return (await api<{ organization: OrganizationSettings }>('/v1/organization')).organization;
}

export async function saveOrganization(input: Partial<OrganizationSettings>) {
  return (
    await api<{ organization: OrganizationSettings }>('/v1/organization', {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  ).organization;
}

export async function saveWechatSettings(input: WechatPaymentSettingsInput) {
  return api<unknown>('/v1/payment-settings/wechat', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function saveAlipaySettings(input: AlipayPaymentSettingsInput) {
  return api<unknown>('/v1/payment-settings/alipay', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function fetchSmtpSettings() {
  return api<SystemSettingOverview>('/v1/system-settings/smtp');
}

export async function saveSmtpSettings(input: SmtpSettingsInput) {
  return api<SystemSettingOverview>('/v1/system-settings/smtp', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function testSmtpSettings(input: SmtpSettingsInput & { testTo: string }) {
  return api<{ ok: boolean; to: string }>('/v1/system-settings/smtp/test', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function clearSmtpSettings() {
  return api<{ ok: boolean }>('/v1/system-settings/smtp', { method: 'DELETE' });
}

export async function fetchQiniuSettings() {
  return api<SystemSettingOverview>('/v1/system-settings/qiniu');
}

export async function saveQiniuSettings(input: QiniuSettingsInput) {
  return api<SystemSettingOverview>('/v1/system-settings/qiniu', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function testQiniuSettings(input: QiniuSettingsInput) {
  return api<{ ok: boolean }>('/v1/system-settings/qiniu/test', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function clearQiniuSettings() {
  return api<{ ok: boolean }>('/v1/system-settings/qiniu', { method: 'DELETE' });
}
