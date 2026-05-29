import { createSign, createVerify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { httpError } from '../../../lib/http-error.js';

const secretFileCache = new Map<string, string>();

function resolvePath(filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

export function secretConfigured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function fileSecretConfigured(filePath: string | undefined) {
  if (!secretConfigured(filePath)) {
    return false;
  }

  try {
    return fs.existsSync(resolvePath(filePath!.trim()));
  } catch {
    return false;
  }
}

export function readSecretFile(filePath: string | undefined, label: string) {
  if (!filePath?.trim()) {
    throw httpError(422, `${label} is not configured`);
  }

  const absolutePath = resolvePath(filePath.trim());
  const cached = secretFileCache.get(absolutePath);
  if (cached) {
    return cached;
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    secretFileCache.set(absolutePath, content);
    return content;
  } catch {
    throw httpError(500, `Failed to read ${label} from ${absolutePath}`);
  }
}

export function readSecretValue(input: { inlineValue?: string; filePath?: string; label: string }) {
  if (input.inlineValue?.trim()) {
    return input.inlineValue.trim();
  }

  return readSecretFile(input.filePath, input.label);
}

export function resolvePublicBaseUrl(input: { publicBaseUrl?: string; appBaseUrl?: string }) {
  return input.publicBaseUrl?.trim() || input.appBaseUrl?.trim() || 'http://localhost:8090';
}

export function resolveCallbackUrl(explicitUrl: string | undefined, publicBaseUrl: string, pathname: string) {
  if (explicitUrl?.trim()) {
    return explicitUrl.trim();
  }

  return new URL(pathname, publicBaseUrl).toString();
}

export function amountFenToYuanString(amount: number) {
  if (!Number.isInteger(amount)) {
    throw httpError(500, 'Amount must be stored as integer cents');
  }

  return (amount / 100).toFixed(2);
}

export function amountYuanStringToFen(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw httpError(400, `Invalid amount value: ${value}`);
  }

  const [integerPart = '0', decimalPart = ''] = normalized.split('.');
  return Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));
}

export function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function normalizeFormBody(body: unknown) {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return parseRawFormBody(body.toString('utf8'), true);
  }

  const result: Record<string, string> = {};
  const record = normalizeObject(body);

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      const [first] = value;
      if (first !== undefined && first !== null) {
        result[key] = String(first);
      }
      continue;
    }

    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }

  return result;
}

export function parseRawFormBody(rawBody: string, decode = false) {
  const result: Record<string, string> = {};

  for (const pair of rawBody.split('&')) {
    if (!pair) {
      continue;
    }

    const separatorIndex = pair.indexOf('=');
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);
    const key = decode ? decodeURIComponent(rawKey.replace(/\+/g, ' ')) : rawKey;
    const value = decode ? decodeURIComponent(rawValue.replace(/\+/g, ' ')) : rawValue;

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

export function buildSortedSignContent(values: Record<string, string | number | boolean | undefined | null>) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export function signRsa(content: string, privateKey: string, signType: 'RSA' | 'RSA2') {
  const signer = createSign(signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1');
  signer.update(content, 'utf8');
  signer.end();
  return signer.sign(privateKey, 'base64');
}

export function verifyRsa(content: string, signature: string, publicKey: string, signType: 'RSA' | 'RSA2') {
  const verifier = createVerify(signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1');
  verifier.update(content, 'utf8');
  verifier.end();
  return verifier.verify(publicKey, signature, 'base64');
}

export function formatShanghaiTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
