import { ClientType } from '../../types/express';
import { FeatureFlagReader } from '../feature-flag.types';

/**
 * Strategy contract for "how should history be read?". Concrete strategies
 * decide the bounds; the repository owns the actual query.
 */
export interface HistoryQueryBounds {
  readonly take?: number;
  /** Cursor support is left to the repository; strategy only decides bounds. */
}

export interface HistoryStrategy {
  readonly name: 'full' | 'limited';
  resolveQuery(): HistoryQueryBounds;
}

export class FullHistoryStrategy implements HistoryStrategy {
  readonly name = 'full' as const;
  resolveQuery(): HistoryQueryBounds {
    return {};
  }
}

export class LimitedHistoryStrategy implements HistoryStrategy {
  readonly name = 'limited' as const;
  constructor(private readonly limit: number) {}
  resolveQuery(): HistoryQueryBounds {
    return { take: this.limit };
  }
}

export class HistoryStrategyFactory {
  constructor(private readonly flags: FeatureFlagReader) {}

  /**
   * Mobile clients always get the limited view (bandwidth, scrollback UX) —
   * the flag only governs other clients. Desktop/web honour the flag.
   */
  resolve(clientType?: ClientType): HistoryStrategy {
    const limited: number = this.flags.get('CHAT_HISTORY_LIMITED_COUNT');
    if (clientType === 'mobile') {
      return new LimitedHistoryStrategy(limited);
    }
    if (this.flags.isEnabled('CHAT_HISTORY_ENABLED')) {
      return new FullHistoryStrategy();
    }
    return new LimitedHistoryStrategy(limited);
  }
}
