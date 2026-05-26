import { env, Env } from './env';

export interface AppConfig {
  env: Env['NODE_ENV'];
  port: number;
  logLevel: Env['LOG_LEVEL'];
  database: {
    url: string;
    pool: { min: number; max: number };
  };
  security: {
    jwtSecret: string;
    jwtExpiresIn: string;
    firebaseAppCheckEnabled: boolean;
  };
  cors: {
    origins: string[];
  };
  ai: {
    provider: Env['AI_PROVIDER'];
    openaiApiKey?: string;
    openaiModel: string;
  };
  demo: {
    loginEnabled: boolean;
  };
  rateLimit: {
    store: Env['RATE_LIMIT_STORE'];
    redisUrl?: string;
  };
  // initial values for feature flags (the FeatureFlagService treats these as the
  // source of truth that can be reloaded at runtime)
  featureFlags: {
    STREAMING_ENABLED: boolean;
    PAGINATION_LIMIT: number;
    AI_TOOLS_ENABLED: boolean;
    CHAT_HISTORY_ENABLED: boolean;
    RATE_LIMIT_PER_MINUTE: number;
    CHAT_HISTORY_LIMITED_COUNT: number;
  };
}

/**
 * Singleton Config service.
 * Centralises read access to all environment + constants.
 * The class indirection keeps consumers honest — they ask the service for
 * the values they need, rather than reading `process.env` directly.
 */
export class Config {
  private static _instance: Config;
  private readonly _config: AppConfig;

  private constructor() {
    this._config = {
      env: env.NODE_ENV,
      port: env.PORT,
      logLevel: env.LOG_LEVEL,
      database: {
        url: env.DATABASE_URL,
        pool: { min: env.DATABASE_POOL_MIN, max: env.DATABASE_POOL_MAX },
      },
      security: {
        jwtSecret: env.JWT_SECRET,
        jwtExpiresIn: env.JWT_EXPIRES_IN,
        firebaseAppCheckEnabled: env.FIREBASE_APP_CHECK_ENABLED,
      },
      cors: {
        origins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
      },
      ai: {
        provider: env.AI_PROVIDER,
        openaiApiKey: env.OPENAI_API_KEY,
        openaiModel: env.OPENAI_MODEL,
      },
      demo: {
        loginEnabled: env.DEMO_LOGIN_ENABLED,
      },
      rateLimit: {
        store: env.RATE_LIMIT_STORE,
        redisUrl: env.REDIS_URL,
      },
      featureFlags: {
        STREAMING_ENABLED: env.STREAMING_ENABLED,
        PAGINATION_LIMIT: env.PAGINATION_LIMIT,
        AI_TOOLS_ENABLED: env.AI_TOOLS_ENABLED,
        CHAT_HISTORY_ENABLED: env.CHAT_HISTORY_ENABLED,
        RATE_LIMIT_PER_MINUTE: env.RATE_LIMIT_PER_MINUTE,
        CHAT_HISTORY_LIMITED_COUNT: env.CHAT_HISTORY_LIMITED_COUNT,
      },
    };
  }

  static getInstance(): Config {
    if (!this._instance) {
      this._instance = new Config();
    }
    return this._instance;
  }

  get(): AppConfig {
    return this._config;
  }

  isProduction(): boolean {
    return this._config.env === 'production';
  }
}

export const config = Config.getInstance();
