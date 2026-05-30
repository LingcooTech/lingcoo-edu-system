import type { Database } from '../db/client.js';
import * as settingsRepo from '../db/repositories/settings.js';
import type { AppEnv } from './env.js';
import { httpError } from './http-error.js';
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

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim());
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

  async getOverview() {
    const databaseSettings = await this.getDatabaseSettings();
    const envSettings = fromEnv(this.env);
    const effective = databaseSettings ?? envSettings;
    const source = databaseSettings ? 'database' : envSettings ? 'env' : 'none';

    return {
      configured: Boolean(effective?.host && effective.user && effective.password),
      source,
      values: {
        host: effective?.host ?? '',
        port: effective?.port ?? 465,
        secure: effective?.secure ?? true,
        user: effective?.user ?? '',
        from: effective?.from ?? '',
      },
      secrets: {
        password: { configured: hasSecret(effective?.password) },
      },
    };
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
    return this.getOverview();
  }

  async testConnection(input: Partial<MailerConfig> & { testTo?: string }) {
    const existing = (await this.getDatabaseSettings()) ?? fromEnv(this.env);
    const config: MailerConfig = {
      host: normalizeString(input.host) || existing?.host || '',
      port: typeof input.port === 'number' ? input.port : (existing?.port ?? 465),
      secure: input.secure ?? existing?.secure ?? true,
      user: normalizeString(input.user) || existing?.user || '',
      password: normalizeString(input.password) || existing?.password || '',
      from: normalizeString(input.from) || existing?.from || '',
    };

    const to = normalizeString(input.testTo);
    if (!config.host || !config.user || !config.password) {
      throw httpError(422, 'SMTP 配置不完整，请先填写 host、user 和 password');
    }
    if (!to) {
      throw httpError(422, '请填写测试收件人邮箱');
    }

    const mailer = new Mailer(config);
    await mailer.send({
      to,
      subject: 'FD-edu SMTP 测试邮件',
      text: '这是一封来自 FD-edu 系统设置的 SMTP 测试邮件。',
      html: '<p>这是一封来自 FD-edu 系统设置的 SMTP 测试邮件。</p>',
    });
    return { ok: true, to };
  }

  async clearSettings() {
    await settingsRepo.deleteSetting(this.db, SMTP_SETTING_KEY);
  }

  async createMailer(): Promise<Mailer> {
    const config = await this.getRuntimeSettings();
    return new Mailer(config?.password ? config : null);
  }
}
