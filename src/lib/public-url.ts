import type { FastifyRequest } from 'fastify';

import type { AppEnv } from './env.js';

const LOCAL_PUBLIC_WEB_BASE_URL = 'http://localhost:5174';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw?.split(',')[0]?.trim();
  return first || null;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}

function requestOrigin(request: FastifyRequest): string | null {
  const host =
    firstHeaderValue(request.headers['x-forwarded-host']) ?? firstHeaderValue(request.headers.host);
  if (!host) {
    return null;
  }

  const protocol =
    firstHeaderValue(request.headers['x-forwarded-proto']) ??
    firstHeaderValue(request.headers['x-forwarded-scheme']) ??
    request.protocol ??
    'http';

  return `${protocol}://${host}`;
}

/**
 * Resolves the public web origin used in QR codes and public CTA links.
 * In production, a leftover localhost default is ignored and the request host
 * is used so generated QR codes point at the real deployed domain.
 */
export function resolvePublicWebBaseUrl(env: AppEnv, request: FastifyRequest): string {
  const candidates = [env.PUBLIC_WEB_BASE_URL, env.PUBLIC_WEB_ORIGIN].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  for (const candidate of candidates) {
    if (env.NODE_ENV === 'production' && isLoopbackUrl(candidate)) {
      continue;
    }
    return trimTrailingSlashes(candidate);
  }

  const origin = requestOrigin(request);
  if (origin) {
    return trimTrailingSlashes(origin);
  }

  return trimTrailingSlashes(candidates[0] ?? LOCAL_PUBLIC_WEB_BASE_URL);
}
