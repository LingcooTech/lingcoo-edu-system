import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string | null | undefined): boolean {
  if (!passwordHash) {
    return false;
  }

  const [algorithm, salt, hash] = passwordHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Default provisioning password derived from a phone number: the last 6
 * characters. Returns null when there is no usable phone (< 6 chars), so the
 * caller can decide whether to fall back to something else or skip creation.
 * Used for accounts provisioned on the user's behalf (parent on checkout,
 * teacher on resource creation) together with `mustChangePassword`.
 */
export function defaultPasswordFromPhone(phone: string | null | undefined): string | null {
  const normalized = phone?.trim();
  if (normalized && normalized.length >= 6) {
    return normalized.slice(-6);
  }
  return null;
}
