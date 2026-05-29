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

  // Public base URL for notification CTA links and payment notify/return URLs.
  PUBLIC_WEB_BASE_URL: z.string().default('http://localhost:5174'),

  // Settings encryption (AES-256-GCM key-derivation secret); falls back to JWT_SECRET.
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),

  // Parent (家长) account self-signed token secret; falls back to JWT_SECRET.
  PARENT_TOKEN_SECRET: z.string().optional(),

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
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(): AppEnv {
  return envSchema.parse(process.env);
}
