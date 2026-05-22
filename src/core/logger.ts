import pino, { Logger as PinoLogger } from 'pino';
import { config } from '../config';

/**
 * Singleton structured logger built on pino.
 * Pretty-printed in development, JSON in production for log aggregators.
 */
export class Logger {
  private static _instance: Logger;
  private readonly _logger: PinoLogger;

  private constructor() {
    const cfg = config.get();
    const isProd = cfg.env === 'production';

    this._logger = pino({
      level: cfg.logLevel,
      base: { service: 'ai-chat-backend', env: cfg.env },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-firebase-appcheck"]',
          '*.password',
          '*.token',
          '*.jwt',
        ],
        censor: '[REDACTED]',
      },
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
    });
  }

  static getInstance(): Logger {
    if (!this._instance) {
      this._instance = new Logger();
    }
    return this._instance;
  }

  child(bindings: Record<string, unknown>): PinoLogger {
    return this._logger.child(bindings);
  }

  get raw(): PinoLogger {
    return this._logger;
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this._logger.info(data ?? {}, msg);
  }
  debug(msg: string, data?: Record<string, unknown>): void {
    this._logger.debug(data ?? {}, msg);
  }
  warn(msg: string, data?: Record<string, unknown>): void {
    this._logger.warn(data ?? {}, msg);
  }
  error(msg: string, data?: Record<string, unknown>): void {
    this._logger.error(data ?? {}, msg);
  }
  fatal(msg: string, data?: Record<string, unknown>): void {
    this._logger.fatal(data ?? {}, msg);
  }
}

export const logger = Logger.getInstance();
