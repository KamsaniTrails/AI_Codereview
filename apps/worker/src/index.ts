import { logger } from '@ai-reviewer/core';
import { startReviewWorker } from './review.worker.js';
import { startIndexWorker } from './index.worker.js';

logger.info('Initializing AI Code Review background workers...');

const reviewWorker = startReviewWorker();
const indexWorker = startIndexWorker();

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Graceful shutdown initiated. Waiting for active jobs to finish...');
  try {
    await Promise.all([
      reviewWorker.close(),
      indexWorker.close()
    ]);
    logger.info('All workers terminated cleanly.');
    process.exit(0);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error closing background workers');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

