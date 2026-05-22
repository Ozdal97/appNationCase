import { EventEmitter } from 'node:events';
import { config } from '../config';
import { logger } from '../core/logger';
import {
  BooleanFeatureFlagKey,
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_VALIDATORS,
  FeatureFlagKey,
  FeatureFlagReader,
  FeatureFlagSchema,
  FeatureFlagValue,
} from './feature-flag.types';

export interface FeatureFlagChangeEvent<K extends FeatureFlagKey = FeatureFlagKey> {
  readonly key: K;
  readonly prev: FeatureFlagValue<K>;
  readonly next: FeatureFlagValue<K>;
}

/**
 * Singleton FeatureFlagService.
 *
 * - Loads initial values from Config (which reads env or a config file).
 * - Exposes typed get/set so consumers don't deal with `unknown`.
 * - Supports runtime reload via `reload()` or `set()` — no redeploy needed.
 * - Emits 'change' events so middleware (e.g. rate limiter) can re-bind itself.
 * - Per-flag validators guarantee bad values can never be stored.
 *
 * Consumers that only need to READ flags should depend on the narrower
 * {@link FeatureFlagReader} interface — keeps services honest (ISP).
 */
export class FeatureFlagService extends EventEmitter implements FeatureFlagReader {
  private static _instance: FeatureFlagService | undefined;
  private readonly _flags: FeatureFlagSchema;

  private constructor() {
    super();
    this._flags = { ...FEATURE_FLAG_DEFAULTS, ...config.get().featureFlags };
    logger.info('feature flags initialised', { flags: this._flags });
  }

  static getInstance(): FeatureFlagService {
    if (!FeatureFlagService._instance) {
      FeatureFlagService._instance = new FeatureFlagService();
    }
    return FeatureFlagService._instance;
  }

  /** Returns the typed value of a flag. */
  get<K extends FeatureFlagKey>(key: K): FeatureFlagValue<K> {
    return this._flags[key];
  }

  /** Boolean convenience for boolean flags. */
  isEnabled(key: BooleanFeatureFlagKey): boolean {
    return this._flags[key] as boolean;
  }

  /** Snapshot of all flags (read-only copy). */
  all(): Readonly<FeatureFlagSchema> {
    return { ...this._flags };
  }

  /** Atomically update a single flag. Bad values are rejected & logged. */
  set<K extends FeatureFlagKey>(key: K, value: FeatureFlagValue<K>): boolean {
    const validator = FEATURE_FLAG_VALIDATORS[key] as (v: unknown) => v is FeatureFlagValue<K>;
    if (!validator(value)) {
      logger.warn('feature flag update rejected — invalid value', { key, value });
      return false;
    }
    const prev: FeatureFlagValue<K> = this._flags[key];
    this._flags[key] = value;
    logger.info('feature flag updated', { key, prev, next: value });
    const event: FeatureFlagChangeEvent<K> = { key, prev, next: value };
    this.emit('change', event);
    return true;
  }

  /** Bulk reload from a partial source (env, JSON file, remote config, ...) */
  reload(source?: Partial<FeatureFlagSchema>): void {
    const next: Partial<FeatureFlagSchema> = source ?? config.get().featureFlags;
    let changed = 0;
    for (const [rawKey, rawValue] of Object.entries(next)) {
      const key = rawKey as FeatureFlagKey;
      const validator = FEATURE_FLAG_VALIDATORS[key] as (v: unknown) => boolean;
      if (validator(rawValue) && this._flags[key] !== rawValue) {
        const prev = this._flags[key];
        // Narrowing past `keyof` would require an unwieldy switch; the per-key
        // validator above has already proven that `rawValue` matches the type
        // of `this._flags[key]`, so this assignment is sound.
        (this._flags as Record<FeatureFlagKey, unknown>)[key] = rawValue;
        this.emit('change', { key, prev, next: rawValue });
        changed += 1;
      }
    }
    logger.info('feature flags reloaded', { changed, flags: this._flags });
  }
}

export const featureFlags: FeatureFlagService = FeatureFlagService.getInstance();
