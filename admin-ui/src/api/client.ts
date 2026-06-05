import type {
  AlipayPaymentSettingsInput,
  OrganizationSettings,
  PaymentProviderOverview,
  QiniuImageListResponse,
  QiniuSettingsInput,
  QiniuUploadTokenResponse,
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
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }
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

// The back office no longer has its own login page — login happens on the
// public web (the single front door). Here we only read the current account
// (to gate /admin on role) and clear the shared session on logout.
export async function fetchMe(): Promise<AuthAccount | null> {
  const payload = await api<{ account: AuthAccount | null }>('/auth/me');
  return payload.account;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  clearToken();
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

export async function fetchQiniuImages(
  input: {
    prefix?: string;
    marker?: string | null;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (input.prefix) params.set('prefix', input.prefix);
  if (input.marker) params.set('marker', input.marker);
  if (input.limit) params.set('limit', String(input.limit));
  const query = params.toString();
  return api<QiniuImageListResponse>(`/v1/storage/qiniu/images${query ? `?${query}` : ''}`);
}

export async function createQiniuUploadToken(input: { filename: string; prefix?: string }) {
  return api<QiniuUploadTokenResponse>('/v1/storage/qiniu/upload-token', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function uploadQiniuImage(file: File, prefix?: string) {
  const token = await createQiniuUploadToken({ filename: file.name, prefix });
  const body = new FormData();
  body.set('token', token.uploadToken);
  body.set('key', token.key);
  body.set('file', file);

  const response = await fetch(token.uploadHost, {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim();
    throw new Error(detail || `七牛云上传失败：${response.status}`);
  }

  return {
    key: token.key,
    url: token.publicUrl,
    publicUrl: token.publicUrl,
  };
}
