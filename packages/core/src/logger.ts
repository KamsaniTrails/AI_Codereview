import pino from 'pino';

export interface LogContext {
  deliveryId?: string;
  reviewId?: string;
  repoId?: string;
  stage?: string;
  prNumber?: number;
  agent?: string;
  [key: string]: unknown;
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export function createLogger(context?: LogContext) {
  return context ? baseLogger.child(context) : baseLogger;
}

export const logger = baseLogger;

