import type { Database } from '../db/client.js';
import * as settingsRepo from '../db/repositories/settings.js';
import type { AppEnv } from './env.js';
import { Mailer, type MailerConfig } from './mailer.js';
import { decryptJson, encryptJson } from './settings-crypto.js';

const SMTP_SETTING_KEY = 'system.smtp';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getEncryptionSecret(env: AppEnv) {
  return env.SETTINGS_ENCRYPTION_KEY?.trim() || env.JWT_SECRET;
}

function fromEnv(env: AppEnv): MailerConfig | null {
  const host = normalizeString(env.SMTP_HOST);
  const user = normalizeString(env.SMTP_USER);
  const password = normalizeString(env.SMTP_PASSWORD);
  if (!host || !user || !password) {
    return null;
  }
  return {
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user,
    password,
    from: normalizeString(env.SMTP_FROM) || user,
  };
}

export class SmtpSettingsService {
  constructor(
    private readonly db: Database,
    private readonly env: AppEnv,
  ) {}

  async getDatabaseSettings(): Promise<MailerConfig | null> {
    const row = await settingsRepo.getSetting(this.db, SMTP_SETTING_KEY);
    if (!row) {
      return null;
    }
    const value = row.isEncrypted
      ? decryptJson<Partial<MailerConfig>>(row.value, getEncryptionSecret(this.env))
      : (row.value as Partial<MailerConfig>);
    const host = normalizeString(value.host);
    const user = normalizeString(value.user);
    const password = normalizeString(value.password);
    if (!host || !user || !password) {
      return null;
    }
    return {
      host,
      port: typeof value.port === 'number' ? value.port : 465,
      secure: value.secure ?? true,
      user,
      password,
      from: normalizeString(value.from) || user,
    };
  }

  async getRuntimeSettings(): Promise<MailerConfig | null> {
    return (await this.getDatabaseSettings()) ?? fromEnv(this.env);
  }

  async upsertSettings(input: Partial<MailerConfig>, updatedBy?: string) {
    const existing = (await this.getDatabaseSettings()) ?? fromEnv(this.env);
    const next: MailerConfig = {
      host: normalizeString(input.host) || existing?.host || '',
      port: typeof input.port === 'number' ? input.port : (existing?.port ?? 465),
      secure: input.secure ?? existing?.secure ?? true,
      user: normalizeString(input.user) || existing?.user || '',
      password: normalizeString(input.password) || existing?.password || '',
      from: normalizeString(input.from) || existing?.from || '',
    };
    await settingsRepo.setSetting(this.db, {
      key: SMTP_SETTING_KEY,
      value: encryptJson(next, getEncryptionSecret(this.env)),
      isEncrypted: true,
      updatedBy,
    });
    return { configured: Boolean(next.host && next.user && next.password) };
  }

  async createMailer(): Promise<Mailer> {
    const config = await this.getRuntimeSettings();
    return new Mailer(config?.password ? config : null);
  }
}
