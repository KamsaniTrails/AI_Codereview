import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getConfig,
  logger,
  type ReviewJobPayload,
  type IndexJobPayload
} from '@ai-reviewer/core';

let redisClient: Redis | null = null;
let reviewQueue: Queue<ReviewJobPayload> | null = null;
let indexQueue: Queue<IndexJobPayload> | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const config = getConfig();
    redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000)
    });

    redisClient.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis connection warning (running with in-memory fallback if unavailable)');
    });
  }
  return redisClient;
}

export function getReviewQueue(): Queue<ReviewJobPayload> {
  if (!reviewQueue) {
    const redis = getRedisClient();
    reviewQueue = new Queue<ReviewJobPayload>('review', {
      connection: redis as any,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 1000,
        removeOnFail: 5000
      }
    });
  }
  return reviewQueue;
}

export function getIndexQueue(): Queue<IndexJobPayload> {
  if (!indexQueue) {
    const redis = getRedisClient();
    indexQueue = new Queue<IndexJobPayload>('index', {
      connection: redis as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000
        }
      }
    });
  }
  return indexQueue;
}

export async function enqueueReviewJob(payload: ReviewJobPayload): Promise<string> {
  const jobId = `${payload.repoId}:${payload.prNumber}:${payload.headSha}`;
  logger.info({ jobId, prNumber: payload.prNumber }, 'Enqueuing review job');

  try {
    const queue = getReviewQueue();
    const addPromise = queue.add('process-pr-review', payload, {
      jobId,
      delay: 10000
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timed out (offline)')), 300)
    );
    await Promise.race([addPromise, timeoutPromise]);
  } catch (err: any) {
    logger.warn({ err: err.message, jobId }, 'BullMQ review queue enqueue warning');
  }

  return jobId;
}

export async function enqueueIndexJob(payload: IndexJobPayload): Promise<string> {
  const jobId = `${payload.repoId}:${payload.commitSha}`;
  logger.info({ jobId, repo: payload.repoFullName }, 'Enqueuing index job');

  try {
    const queue = getIndexQueue();
    const addPromise = queue.add('index-repository', payload, { jobId });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timed out (offline)')), 300)
    );
    await Promise.race([addPromise, timeoutPromise]);
  } catch (err: any) {
    logger.warn({ err: err.message, jobId }, 'BullMQ index queue enqueue warning');
  }

  return jobId;
}

export async function flagReviewAsCancelled(reviewId: string): Promise<void> {
  logger.info({ reviewId }, 'Setting review cancellation flag');
  try {
    const redis = getRedisClient();
    await redis.set(`cancel:${reviewId}`, '1', 'EX', 3600); // Expires in 1 hour
  } catch (err: any) {
    logger.warn({ err: err.message, reviewId }, 'Could not set Redis cancel key');
  }
}

export async function isReviewCancelled(reviewId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const val = await redis.get(`cancel:${reviewId}`);
    return val === '1';
  } catch {
    return false;
  }
}

