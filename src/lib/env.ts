import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('fd-edu-stack'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(8090),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),
  JWT_SECRET: z.string().min(12).default('change-me-in-production'),
  DATABASE_URL: z.string().default('postgres://fd_edu:fd_edu@localhost:5434/fd_edu'),
  REDIS_URL: z.string().default('redis://localhost:6381'),
  LOG_LEVEL: z.string().default('info'),

  // Public base URL for notification CTA links and QR landing URLs.
  PUBLIC_WEB_BASE_URL: z.string().default('http://localhost:5174'),
  // Backwards-compatible alias used by older deployments.
  PUBLIC_WEB_ORIGIN: z.string().optional(),

  // Settings encryption (AES-256-GCM key-derivation secret); falls back to JWT_SECRET.
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),

  // Parent (家长) account self-signed token secret; falls back to JWT_SECRET.
  PARENT_TOKEN_SECRET: z.string().optional(),

  // WeChat Mini Program login. Keep AppSecret in runtime env only.
  WECHAT_MINI_PROGRAM_APP_ID: z.string().optional(),
  WECHAT_MINI_PROGRAM_APP_SECRET: z.string().optional(),
  WECHAT_MINI_PROGRAM_STATE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['developer', 'trial', 'formal']).optional(),
  ),
  WECHAT_MINI_SUBSCRIBE_TRIAL_TEMPLATE_ID: z.string().optional(),
  WECHAT_MINI_SUBSCRIBE_PAYMENT_TEMPLATE_ID: z.string().optional(),
  WECHAT_MINI_SUBSCRIBE_LESSON_REMINDER_TEMPLATE_ID: z.string().optional(),
  WECHAT_MINI_SUBSCRIBE_LESSON_CONSUMED_TEMPLATE_ID: z.string().optional(),
  WECHAT_MINI_SUBSCRIBE_LEARNING_UPDATE_TEMPLATE_ID: z.string().optional(),

  // SMTP (email verification / password reset).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((value) => (typeof value === 'string' ? value === 'true' : value)),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // 七牛云 Qiniu object storage.
  QINIU_ACCESS_KEY: z.string().optional(),
  QINIU_SECRET_KEY: z.string().optional(),
  QINIU_BUCKET_NAME: z.string().optional(),
  QINIU_PUBLIC_BASE_URL: z.string().optional(),
  QINIU_UPLOAD_HOST: z.string().optional(),
  QINIU_DEFAULT_PREFIX: z.string().optional(),

  // Public origin of the API (where WeChat/Alipay deliver async callbacks).
  // In production this is the customer-facing https domain; the notify URL is
  // resolved against it. Falls back to the API host in dev.
  PUBLIC_BASE_URL: z.string().optional(),
  APP_BASE_URL: z.string().optional(),

  // 微信支付 WeChat Pay (native QR). Optional: provider stays dormant until set.
  // Live secrets may also be stored AES-encrypted in the `settings` table and
  // take precedence over env at runtime (see PaymentSettingsService).
  WECHAT_PAY_APP_ID: z.string().optional(),
  WECHAT_PAY_APP_SECRET: z.string().optional(),
  WECHAT_PAY_MCH_ID: z.string().optional(),
  WECHAT_PAY_KEY: z.string().optional(),
  WECHAT_PAY_API_V3_KEY: z.string().optional(),
  WECHAT_PAY_API_BASE_URL: z.string().optional(),
  WECHAT_PAY_NOTIFY_URL: z.string().optional(),
  WECHAT_PAY_DISABLE_H5: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => (typeof value === 'string' ? value === 'true' : value)),

  // 支付宝 Alipay (page redirect, or F2F precreate QR). Inline PEM keys are used
  // on read-only filesystems; *_PATH variants are supported for parity.
  ALIPAY_APP_ID: z.string().optional(),
  ALIPAY_PRIVATE_KEY: z.string().optional(),
  ALIPAY_PRIVATE_KEY_PATH: z.string().optional(),
  ALIPAY_PUBLIC_KEY: z.string().optional(),
  ALIPAY_PUBLIC_KEY_PATH: z.string().optional(),
  ALIPAY_GATEWAY: z.string().optional(),
  ALIPAY_NOTIFY_URL: z.string().optional(),
  ALIPAY_RETURN_URL: z.string().optional(),
  ALIPAY_KEY_TYPE: z.enum(['PKCS1', 'PKCS8']).optional(),
  ALIPAY_F2F_PAY: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => (typeof value === 'string' ? value === 'true' : value)),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(): AppEnv {
  return envSchema.parse(process.env);
}
