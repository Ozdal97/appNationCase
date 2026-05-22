import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from './logger';

/**
 * Singleton Prisma client owner.
 *
 * Prisma's own connection pool is configured via the `connection_limit`
 * URL parameter — we surface that through DATABASE_POOL_MAX. The Database
 * class owns the client lifecycle (connect/disconnect on signals) and is
 * the only place in the app that constructs a PrismaClient.
 */
export class Database {
  private static _instance: Database;
  private readonly _client: PrismaClient;
  private _connected = false;

  private constructor() {
    const cfg = config.get();
    const url = this.applyPoolLimit(cfg.database.url, cfg.database.pool.max);

    this._client = new PrismaClient({
      datasources: { db: { url } },
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
        ...(cfg.env === 'development'
          ? ([{ level: 'query', emit: 'event' }] as const)
          : []),
      ],
    });

    this._client.$on('warn' as never, (e: unknown) =>
      logger.warn('prisma warn', { event: e }),
    );
    this._client.$on('error' as never, (e: unknown) =>
      logger.error('prisma error', { event: e }),
    );
    if (cfg.env === 'development') {
      this._client.$on('query' as never, (e: unknown) =>
        logger.debug('prisma query', { event: e }),
      );
    }
  }

  static getInstance(): Database {
    if (!this._instance) {
      this._instance = new Database();
    }
    return this._instance;
  }

  get client(): PrismaClient {
    return this._client;
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    await this._client.$connect();
    this._connected = true;
    logger.info('database connected');
  }

  async disconnect(): Promise<void> {
    if (!this._connected) return;
    await this._client.$disconnect();
    this._connected = false;
    logger.info('database disconnected');
  }

  private applyPoolLimit(url: string, max: number): string {
    if (url.includes('connection_limit=')) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}connection_limit=${max}`;
  }
}

export const database = Database.getInstance();
