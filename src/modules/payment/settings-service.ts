import type { FastifyInstance } from 'fastify';

import type { AppEnv } from '../../lib/env.js';
import { decryptJson, encryptJson } from '../../lib/settings-crypto.js';
import {
  deleteSetting,
  getSetting,
  setSetting,
  type SettingRecord
} from '../../db/repositories/settings.js';
import { fileSecretConfigured, secretConfigured } from './providers/shared.js';
import { getPaymentProvider } from './providers/index.js';
import type { PaymentProviderCode } from './providers/types.js';

const WECHAT_SETTINGS_KEY = 'billing.provider.wechat_pay';
const ALIPAY_SETTINGS_KEY = 'billing.provider.alipay';
const ALIPAY_DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do';

export interface WechatPaymentSettingsInput {
  appId?: string;
  appSecret?: string;
  mchId?: string;
  apiKey?: string;
  disableH5?: boolean;
  notifyUrl?: string;
}

export interface AlipayPaymentSettingsInput {
  appId?: string;
  gateway?: string;
  notifyUrl?: string;
  returnUrl?: string;
  keyType?: 'PKCS1' | 'PKCS8';
  f2fPay?: boolean;
  privateKeyPem?: string;
  publicKeyPem?: string;
}

export type PaymentSettingsSource = 'database' | 'env' | 'none';

export interface PaymentProviderOverviewItem {
  code: PaymentProviderCode;
  label: string;
  source: PaymentSettingsSource;
  configured: boolean;
  supportedModes: string[];
  notifyUrl?: string;
  values: Record<string, string | boolean>;
  secrets: Record<string, { configured: boolean }>;
}

export interface PaymentProviderOverview {
  items: PaymentProviderOverviewItem[];
}

type StoredWechatSettings = {
  appId: string;
  appSecret?: string;
  mchId: string;
  apiKey?: string;
  disableH5: boolean;
  notifyUrl: string;
};

type StoredAlipaySettings = {
  appId: string;
  gateway: string;
  notifyUrl: string;
  returnUrl: string;
  keyType: 'PKCS1' | 'PKCS8';
  f2fPay: boolean;
  privateKeyPem?: string;
  publicKeyPem?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function normalizePem(value: unknown) {
  return normalizeString(value).replace(/\r\n/g, '\n');
}

function normalizeBoolean(value: unknown, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return defaultValue;
    }

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

function secretState(value: string | undefined) {
  return {
    configured: secretConfigured(value)
  };
}

function readWechatSettings(value: unknown): StoredWechatSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const appId = normalizeString(value.appId ?? value.appid);
  const appSecret = normalizeString(value.appSecret ?? value.secret);
  const mchId = normalizeString(value.mchId ?? value.mchid);
  const apiKey = normalizeString(value.apiKey ?? value.apiV3Key ?? value.key);
  const notifyUrl = normalizeString(value.notifyUrl ?? value.notify_url);
  const disableH5 = normalizeBoolean(value.disableH5 ?? value.disable_h5, false);

  if (!appId && !appSecret && !mchId && !apiKey && !notifyUrl) {
    return null;
  }

  return {
    appId,
    appSecret,
    mchId,
    apiKey,
    disableH5,
    notifyUrl
  };
}

function readAlipaySettings(value: unknown): StoredAlipaySettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const appId = normalizeString(value.appId ?? value.appid);
  const privateKeyPem = normalizePem(value.privateKeyPem ?? value.privateKey);
  const publicKeyPem = normalizePem(value.publicKeyPem ?? value.publicKey);
  const gateway = normalizeString(value.gateway) || ALIPAY_DEFAULT_GATEWAY;
  const notifyUrl = normalizeString(value.notifyUrl ?? value.notify_url);
  const returnUrl = normalizeString(value.returnUrl ?? value.return_url);
  const keyType = value.keyType === 'PKCS8' ? 'PKCS8' : 'PKCS1';
  const f2fPay = normalizeBoolean(value.f2fPay ?? value.f2fpay, false);

  if (!appId && !privateKeyPem && !publicKeyPem) {
    return null;
  }

  return {
    appId,
    gateway,
    notifyUrl,
    returnUrl,
    keyType,
    f2fPay,
    privateKeyPem,
    publicKeyPem
  };
}

function paymentModesForAlipay(env: AppEnv) {
  return env.ALIPAY_F2F_PAY ? (['native_qr', 'page_redirect'] as const) : (['page_redirect'] as const);
}

/**
 * Resolves WeChat / Alipay credentials from the encrypted `settings` table
 * (preferred) with a fall-back to environment variables, and exposes a
 * non-secret overview for the admin UI. Mirrors FD-retail's settings service
 * but reads/writes through the FD-edu settings repository.
 */
export class PaymentSettingsService {
  constructor(private readonly app: FastifyInstance) {}

  private getEncryptionSecret() {
    return this.app.appEnv.SETTINGS_ENCRYPTION_KEY?.trim() || this.app.appEnv.JWT_SECRET;
  }

  private decodeSetting(record: SettingRecord) {
    return record.isEncrypted ? decryptJson<unknown>(record.value, this.getEncryptionSecret()) : record.value;
  }

  async getDatabaseWechatSettings() {
    const record = await getSetting(this.app.db, WECHAT_SETTINGS_KEY);
    return record ? readWechatSettings(this.decodeSetting(record)) : null;
  }

  async getDatabaseAlipaySettings() {
    const record = await getSetting(this.app.db, ALIPAY_SETTINGS_KEY);
    return record ? readAlipaySettings(this.decodeSetting(record)) : null;
  }

  private getEnvWechatSettings(): StoredWechatSettings | null {
    const values: StoredWechatSettings = {
      appId: normalizeString(this.app.appEnv.WECHAT_PAY_APP_ID),
      appSecret: normalizeString(this.app.appEnv.WECHAT_PAY_APP_SECRET),
      mchId: normalizeString(this.app.appEnv.WECHAT_PAY_MCH_ID),
      apiKey: normalizeString(this.app.appEnv.WECHAT_PAY_KEY) || normalizeString(this.app.appEnv.WECHAT_PAY_API_V3_KEY),
      disableH5: normalizeBoolean(this.app.appEnv.WECHAT_PAY_DISABLE_H5, false),
      notifyUrl: normalizeString(this.app.appEnv.WECHAT_PAY_NOTIFY_URL)
    };

    if (!values.mchId && !values.appId && !values.appSecret && !values.apiKey && !values.notifyUrl) {
      return null;
    }

    return values;
  }

  private getEnvAlipaySettings(): StoredAlipaySettings | null {
    const values: StoredAlipaySettings = {
      appId: normalizeString(this.app.appEnv.ALIPAY_APP_ID),
      gateway: normalizeString(this.app.appEnv.ALIPAY_GATEWAY) || ALIPAY_DEFAULT_GATEWAY,
      notifyUrl: normalizeString(this.app.appEnv.ALIPAY_NOTIFY_URL),
      returnUrl: normalizeString(this.app.appEnv.ALIPAY_RETURN_URL),
      keyType: this.app.appEnv.ALIPAY_KEY_TYPE ?? 'PKCS1',
      f2fPay: normalizeBoolean(this.app.appEnv.ALIPAY_F2F_PAY, false)
    };
    const privateKeyPem = normalizePem(this.app.appEnv.ALIPAY_PRIVATE_KEY);
    const publicKeyPem = normalizePem(this.app.appEnv.ALIPAY_PUBLIC_KEY);

    if (
      !values.appId &&
      !privateKeyPem &&
      !publicKeyPem &&
      !this.app.appEnv.ALIPAY_PRIVATE_KEY_PATH &&
      !this.app.appEnv.ALIPAY_PUBLIC_KEY_PATH
    ) {
      return null;
    }

    return {
      ...values,
      privateKeyPem,
      publicKeyPem
    };
  }

  /**
   * Produces an env snapshot with DB-stored credentials merged over the static
   * env, so provider adapters can run against the latest admin configuration
   * without a process restart.
   */
  async buildRuntimeEnv(): Promise<AppEnv> {
    const runtimeEnv: AppEnv = { ...this.app.appEnv };
    const [wechat, alipay] = await Promise.all([this.getDatabaseWechatSettings(), this.getDatabaseAlipaySettings()]);

    if (wechat) {
      runtimeEnv.WECHAT_PAY_MCH_ID = wechat.mchId;
      runtimeEnv.WECHAT_PAY_APP_ID = wechat.appId;
      runtimeEnv.WECHAT_PAY_APP_SECRET = wechat.appSecret;
      runtimeEnv.WECHAT_PAY_KEY = wechat.apiKey;
      runtimeEnv.WECHAT_PAY_DISABLE_H5 = wechat.disableH5;
      runtimeEnv.WECHAT_PAY_NOTIFY_URL = wechat.notifyUrl || undefined;
    }

    if (alipay) {
      runtimeEnv.ALIPAY_APP_ID = alipay.appId;
      runtimeEnv.ALIPAY_PRIVATE_KEY = alipay.privateKeyPem;
      runtimeEnv.ALIPAY_PUBLIC_KEY = alipay.publicKeyPem;
      runtimeEnv.ALIPAY_GATEWAY = alipay.gateway || undefined;
      runtimeEnv.ALIPAY_NOTIFY_URL = alipay.notifyUrl || undefined;
      runtimeEnv.ALIPAY_RETURN_URL = alipay.returnUrl || undefined;
      runtimeEnv.ALIPAY_F2F_PAY = alipay.f2fPay;
      runtimeEnv.ALIPAY_KEY_TYPE = alipay.keyType;
    }

    return runtimeEnv;
  }

  async getOverview(input: { includeMock?: boolean } = {}): Promise<PaymentProviderOverview> {
    const [wechatFromDb, alipayFromDb] = await Promise.all([
      this.getDatabaseWechatSettings(),
      this.getDatabaseAlipaySettings()
    ]);
    const runtimeEnv = await this.buildRuntimeEnv();
    const wechat = wechatFromDb ?? this.getEnvWechatSettings();
    const alipay = alipayFromDb ?? this.getEnvAlipaySettings();
    const wechatProvider = getPaymentProvider('wechat_pay');
    const alipayProvider = getPaymentProvider('alipay');
    const wechatSource: PaymentSettingsSource = wechatFromDb ? 'database' : wechat ? 'env' : 'none';
    const alipaySource: PaymentSettingsSource = alipayFromDb ? 'database' : alipay ? 'env' : 'none';
    const wechatOverview = wechatProvider.getOverview(runtimeEnv);
    const alipayOverview = alipayProvider.getOverview(runtimeEnv);

    const wechatItem: PaymentProviderOverviewItem = {
      code: 'wechat_pay',
      label: wechatProvider.label,
      source: wechatSource,
      configured: wechatProvider.isConfigured(runtimeEnv),
      supportedModes: ['native_qr', 'mini_program_jsapi'],
      notifyUrl: wechatOverview.notifyUrl,
      values: {
        appId: wechat?.appId ?? '',
        mchId: wechat?.mchId ?? '',
        notifyUrl: wechat?.notifyUrl ?? '',
        disableH5: wechat?.disableH5 ?? false
      },
      secrets: {
        appSecret: secretState(wechat?.appSecret),
        apiKey: secretState(wechat?.apiKey)
      }
    };

    const alipayItem: PaymentProviderOverviewItem = {
      code: 'alipay',
      label: alipayProvider.label,
      source: alipaySource,
      configured: alipayProvider.isConfigured(runtimeEnv),
      supportedModes: [...paymentModesForAlipay(runtimeEnv)],
      notifyUrl: alipayOverview.notifyUrl,
      values: {
        appId: alipay?.appId ?? '',
        gateway: alipay?.gateway ?? ALIPAY_DEFAULT_GATEWAY,
        notifyUrl: alipay?.notifyUrl ?? '',
        returnUrl: alipay?.returnUrl ?? '',
        keyType: alipay?.keyType ?? 'PKCS1',
        f2fPay: alipay?.f2fPay ?? false
      },
      secrets: {
        privateKeyPem: {
          configured:
            secretConfigured(alipay?.privateKeyPem) || fileSecretConfigured(this.app.appEnv.ALIPAY_PRIVATE_KEY_PATH)
        },
        publicKeyPem: {
          configured:
            secretConfigured(alipay?.publicKeyPem) || fileSecretConfigured(this.app.appEnv.ALIPAY_PUBLIC_KEY_PATH)
        }
      }
    };

    const items: PaymentProviderOverviewItem[] = [wechatItem, alipayItem];
    if (input.includeMock) {
      items.push({
        code: 'mock',
        label: '开发态模拟支付',
        source: 'env',
        configured: this.app.appEnv.NODE_ENV !== 'production',
        supportedModes: ['mock_mini_program'],
        values: {
          nodeEnv: this.app.appEnv.NODE_ENV
        },
        secrets: {}
      });
    }

    return { items };
  }

  async upsertWechatSettings(input: WechatPaymentSettingsInput, updatedBy?: string) {
    const current = (await this.getDatabaseWechatSettings()) ??
      this.getEnvWechatSettings() ?? {
        appId: '',
        appSecret: '',
        mchId: '',
        apiKey: '',
        disableH5: false,
        notifyUrl: ''
      };

    const next: StoredWechatSettings = {
      appId: input.appId !== undefined ? normalizeString(input.appId) : current.appId,
      appSecret: input.appSecret ? normalizeString(input.appSecret) : current.appSecret,
      mchId: input.mchId !== undefined ? normalizeString(input.mchId) : current.mchId,
      apiKey: input.apiKey ? normalizeString(input.apiKey) : current.apiKey,
      disableH5: input.disableH5 ?? current.disableH5,
      notifyUrl: input.notifyUrl !== undefined ? normalizeString(input.notifyUrl) : current.notifyUrl
    };

    await setSetting(this.app.db, {
      key: WECHAT_SETTINGS_KEY,
      value: encryptJson(next, this.getEncryptionSecret()),
      isEncrypted: true,
      updatedBy
    });

    return (await this.getOverview()).items.find((item) => item.code === 'wechat_pay')!;
  }

  async upsertAlipaySettings(input: AlipayPaymentSettingsInput, updatedBy?: string) {
    const current = (await this.getDatabaseAlipaySettings()) ??
      this.getEnvAlipaySettings() ?? {
        appId: '',
        gateway: ALIPAY_DEFAULT_GATEWAY,
        notifyUrl: '',
        returnUrl: '',
        keyType: 'PKCS1' as const,
        f2fPay: false,
        privateKeyPem: '',
        publicKeyPem: ''
      };

    const next: StoredAlipaySettings = {
      appId: input.appId !== undefined ? normalizeString(input.appId) : current.appId,
      gateway: input.gateway !== undefined ? normalizeString(input.gateway) || ALIPAY_DEFAULT_GATEWAY : current.gateway,
      notifyUrl: input.notifyUrl !== undefined ? normalizeString(input.notifyUrl) : current.notifyUrl,
      returnUrl: input.returnUrl !== undefined ? normalizeString(input.returnUrl) : current.returnUrl,
      keyType: input.keyType ?? current.keyType,
      f2fPay: input.f2fPay ?? current.f2fPay,
      privateKeyPem: input.privateKeyPem ? normalizePem(input.privateKeyPem) : current.privateKeyPem,
      publicKeyPem: input.publicKeyPem ? normalizePem(input.publicKeyPem) : current.publicKeyPem
    };

    await setSetting(this.app.db, {
      key: ALIPAY_SETTINGS_KEY,
      value: encryptJson(next, this.getEncryptionSecret()),
      isEncrypted: true,
      updatedBy
    });

    return (await this.getOverview()).items.find((item) => item.code === 'alipay')!;
  }

  async clearProviderSettings(provider: 'wechat_pay' | 'alipay') {
    await deleteSetting(this.app.db, provider === 'wechat_pay' ? WECHAT_SETTINGS_KEY : ALIPAY_SETTINGS_KEY);
  }
}
