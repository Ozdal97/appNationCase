import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 chars (HS256 best practice)'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  FIREBASE_APP_CHECK_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  CORS_ORIGINS: z.string().default('*'),

  // Feature Flags (defaults match the case study spec)
  STREAMING_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  PAGINATION_LIMIT: z.coerce.number().int().min(10).max(100).default(20),
  AI_TOOLS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  CHAT_HISTORY_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  CHAT_HISTORY_LIMITED_COUNT: z.coerce.number().int().positive().default(10),

  DEMO_LOGIN_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  AI_PROVIDER: z.enum(['mock', 'vercel']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),

  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Use console here because Logger depends on env
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env: Env = parsed.data;
