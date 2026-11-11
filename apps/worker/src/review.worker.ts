import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getConfig,
  logger,
  type ReviewJobPayload,
  jobFailuresTotal
} from '@ai-reviewer/core';
import { ReviewPipeline } from './pipeline/reviewPipeline.js';

export function startReviewWorker(redisUrl?: string): Worker<ReviewJobPayload> {
  const config = getConfig();
  const url = redisUrl || config.REDIS_URL;
  const connection = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });

  const pipeline = new ReviewPipeline({
    checkCancellation: async (reviewId) => {
      try {
        const val = await connection.get(`cancel:${reviewId}`);
        return val === '1';
      } catch {
        return false;
      }
    }
  });

  const worker = new Worker<ReviewJobPayload>(
    'review',
    async (job: Job<ReviewJobPayload>) => {
      logger.info({ jobId: job.id, repo: job.data.repoFullName, attempt: job.attemptsMade + 1 }, 'Review worker processing job');
      await pipeline.execute(job.data);
    },
    {
      connection: connection as any,
      concurrency: 3, // Concurrency tuned to LLM rate limits
      limiter: {
        max: 10,
        duration: 1000
      }
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Review job attempt failed');
    jobFailuresTotal.inc({ queue_name: 'review', error_type: err.name || 'Error' });
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Review job completed successfully');
  });

  return worker;
}

