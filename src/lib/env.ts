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
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(): AppEnv {
  return envSchema.parse(process.env);
}
