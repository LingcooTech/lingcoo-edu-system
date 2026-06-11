import type { Database } from '../db/client.js';
import * as settingsRepo from '../db/repositories/settings.js';
import type { AppEnv } from './env.js';
import { httpError } from './http-error.js';
import { decryptJson, encryptJson } from './settings-crypto.js';

const CONTENT_IMPORT_SETTING_KEY = 'system.content.import';

export type ContentImportSettings = {
  wordpress: {
    siteUrl: string;
    username: string;
    appPassword?: string;
  };
  notion: {
    apiToken?: string;
  };
};

export type ContentImportSettingsInput = {
  wordpress?: {
    siteUrl?: string;
    username?: string;
    appPassword?: string;
  };
  notion?: {
    apiToken?: string;
  };
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeUrl(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return '';

  try {
    return new URL(raw).toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim());
}

export class ContentImportSettingsService {
  constructor(
    private readonly db: Database,
    private readonly env: AppEnv,
  ) {}

  private getEncryptionSecret() {
    return this.env.SETTINGS_ENCRYPTION_KEY?.trim() || this.env.JWT_SECRET;
  }

  private decodeSetting(record: settingsRepo.SettingRecord) {
    return record.isEncrypted
      ? decryptJson<unknown>(record.value, this.getEncryptionSecret())
      : record.value;
  }

  private normalizeSettings(value: unknown): ContentImportSettings | null {
    const raw = normalizeObject(value);
    const wordpress = normalizeObject(raw.wordpress);
    const notion = normalizeObject(raw.notion);
    const normalized = {
      wordpress: {
        siteUrl: normalizeUrl(wordpress.siteUrl),
        username: normalizeString(wordpress.username).slice(0, 255),
        appPassword: normalizeString(wordpress.appPassword).slice(0, 255),
      },
      notion: {
        apiToken: normalizeString(notion.apiToken).slice(0, 255),
      },
    } satisfies ContentImportSettings;

    if (
      !normalized.wordpress.siteUrl &&
      !normalized.wordpress.username &&
      !normalized.wordpress.appPassword &&
      !normalized.notion.apiToken
    ) {
      return null;
    }

    return normalized;
  }

  async getDatabaseSettings() {
    const row = await settingsRepo.getSetting(this.db, CONTENT_IMPORT_SETTING_KEY);
    return row ? this.normalizeSettings(this.decodeSetting(row)) : null;
  }

  async getRuntimeSettings() {
    return this.getDatabaseSettings();
  }

  async resolveDraftSettings(
    input: ContentImportSettingsInput = {},
  ): Promise<ContentImportSettings> {
    const existing = await this.getRuntimeSettings();

    return {
      wordpress: {
        siteUrl: normalizeUrl(input.wordpress?.siteUrl) || existing?.wordpress.siteUrl || '',
        username: normalizeString(input.wordpress?.username) || existing?.wordpress.username || '',
        appPassword:
          normalizeString(input.wordpress?.appPassword) || existing?.wordpress.appPassword || '',
      },
      notion: {
        apiToken: normalizeString(input.notion?.apiToken) || existing?.notion.apiToken || '',
      },
    };
  }

  async getOverview() {
    const settings = await this.getRuntimeSettings();

    return {
      configured: Boolean(
        settings?.wordpress.siteUrl || settings?.wordpress.appPassword || settings?.notion.apiToken,
      ),
      source: settings ? 'database' : 'none',
      values: {
        wordpress: {
          siteUrl: settings?.wordpress.siteUrl ?? '',
          username: settings?.wordpress.username ?? '',
        },
        notion: {},
      },
      secrets: {
        wordpress: {
          appPassword: { configured: hasSecret(settings?.wordpress.appPassword) },
        },
        notion: {
          apiToken: { configured: hasSecret(settings?.notion.apiToken) },
        },
      },
    };
  }

  async upsertSettings(input: ContentImportSettingsInput, updatedBy?: string) {
    const next = await this.resolveDraftSettings(input);
    await settingsRepo.setSetting(this.db, {
      key: CONTENT_IMPORT_SETTING_KEY,
      value: encryptJson(next, this.getEncryptionSecret()),
      isEncrypted: true,
      updatedBy,
    });
    return this.getOverview();
  }

  async clearSettings() {
    await settingsRepo.deleteSetting(this.db, CONTENT_IMPORT_SETTING_KEY);
  }

  private basicAuthHeader(username?: string, appPassword?: string) {
    const safeUsername = normalizeString(username);
    const safePassword = normalizeString(appPassword);
    if (!safeUsername || !safePassword) return undefined;
    return `Basic ${Buffer.from(`${safeUsername}:${safePassword}`).toString('base64')}`;
  }

  async testWordPressConnection(input: ContentImportSettingsInput['wordpress'] = {}) {
    const settings = await this.resolveDraftSettings({ wordpress: input });
    if (!settings.wordpress.siteUrl) {
      throw httpError(422, 'WordPress 站点地址未配置');
    }

    const auth = this.basicAuthHeader(settings.wordpress.username, settings.wordpress.appPassword);
    const requestUrl = auth
      ? `${settings.wordpress.siteUrl}/wp-json/wp/v2/users/me`
      : `${settings.wordpress.siteUrl}/wp-json/wp/v2/posts?per_page=1&_fields=id`;

    const response = await fetch(requestUrl, {
      headers: auth ? { Authorization: auth } : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw httpError(502, `WordPress 连接失败 (${response.status})`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      ok: true,
      provider: 'wordpress' as const,
      siteUrl: settings.wordpress.siteUrl,
      mode: auth ? ('authenticated' as const) : ('public' as const),
      account: auth ? normalizeString(data.name || data.slug) || null : null,
    };
  }

  async testNotionConnection(input: ContentImportSettingsInput['notion'] = {}) {
    const settings = await this.resolveDraftSettings({ notion: input });
    if (!settings.notion.apiToken) {
      throw httpError(422, 'Notion API Token 未配置');
    }

    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${settings.notion.apiToken}`,
        'Notion-Version': '2022-06-28',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw httpError(502, `Notion 连接失败 (${response.status})`);
    }

    const data = (await response.json()) as {
      name?: string;
      bot?: { owner?: { workspace_name?: string } };
    };

    return {
      ok: true,
      provider: 'notion' as const,
      workspace: normalizeString(data.bot?.owner?.workspace_name) || null,
      userName: normalizeString(data.name) || null,
    };
  }
}
