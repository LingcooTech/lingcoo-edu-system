import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { httpError } from './http-error.js';

type EncryptedEnvelope = {
  version: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
};

function deriveKey(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptJson(value: unknown, secret: string): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptJson<T>(value: unknown, secret: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(500, 'Encrypted setting payload is invalid');
  }

  const envelope = value as Partial<EncryptedEnvelope>;
  if (
    envelope.version !== 1 ||
    envelope.alg !== 'aes-256-gcm' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.data !== 'string'
  ) {
    throw httpError(500, 'Encrypted setting payload format is invalid');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret),
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(decrypted) as T;
  } catch {
    throw httpError(500, 'Failed to decrypt system setting');
  }
}
