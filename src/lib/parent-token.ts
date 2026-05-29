import { createHmac, timingSafeEqual } from 'node:crypto';

type ParentTokenPayload = {
  parentId: string;
  exp: number;
};

const PARENT_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueParentToken(parentId: string, secret: string) {
  const payload: ParentTokenPayload = {
    parentId,
    exp: Math.floor(Date.now() / 1000) + PARENT_TOKEN_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyParentToken(token: string, secret: string): string | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = Buffer.from(signPayload(encodedPayload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as ParentTokenPayload;
    if (
      typeof payload.parentId !== 'string' ||
      payload.parentId.length === 0 ||
      typeof payload.exp !== 'number' ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload.parentId;
  } catch {
    return null;
  }
}
