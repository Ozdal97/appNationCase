/**
 * Typed feature flag registry. Adding a flag means adding it here, in the
 * env schema, and in the AppConfig — and nothing else.
 */
export interface FeatureFlagSchema {
  STREAMING_ENABLED: boolean;
  PAGINATION_LIMIT: number;
  AI_TOOLS_ENABLED: boolean;
  CHAT_HISTORY_ENABLED: boolean;
  RATE_LIMIT_PER_MINUTE: number;
  CHAT_HISTORY_LIMITED_COUNT: number;
}

export type FeatureFlagKey = keyof FeatureFlagSchema;
export type FeatureFlagValue<K extends FeatureFlagKey> = FeatureFlagSchema[K];

/** Keys whose value type is exactly `boolean`. */
export type BooleanFeatureFlagKey = {
  [K in FeatureFlagKey]: FeatureFlagSchema[K] extends boolean ? K : never;
}[FeatureFlagKey];

/**
 * Read-only view of the flag store. Most consumers (services, strategies,
 * middlewares) only need to read flags — depending on this narrow interface
 * keeps them honest and easier to fake in tests.
 *
 * The full `FeatureFlagService` extends this with `set`/`reload`/event APIs.
 */
export interface FeatureFlagReader {
  get<K extends FeatureFlagKey>(key: K): FeatureFlagValue<K>;
  isEnabled(key: BooleanFeatureFlagKey): boolean;
  all(): Readonly<FeatureFlagSchema>;
}

export const FEATURE_FLAG_DEFAULTS: FeatureFlagSchema = {
  STREAMING_ENABLED: true,
  PAGINATION_LIMIT: 20,
  AI_TOOLS_ENABLED: false,
  CHAT_HISTORY_ENABLED: true,
  RATE_LIMIT_PER_MINUTE: 60,
  CHAT_HISTORY_LIMITED_COUNT: 10,
};

/**
 * Per-flag validators ensure runtime updates can never poison the store.
 * If a value fails validation, the existing value is kept and a warning is logged.
 */
export const FEATURE_FLAG_VALIDATORS: {
  [K in FeatureFlagKey]: (value: unknown) => value is FeatureFlagValue<K>;
} = {
  STREAMING_ENABLED: (v): v is boolean => typeof v === 'boolean',
  AI_TOOLS_ENABLED: (v): v is boolean => typeof v === 'boolean',
  CHAT_HISTORY_ENABLED: (v): v is boolean => typeof v === 'boolean',
  PAGINATION_LIMIT: (v): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 10 && v <= 100,
  RATE_LIMIT_PER_MINUTE: (v): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v > 0,
  CHAT_HISTORY_LIMITED_COUNT: (v): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v > 0,
};
