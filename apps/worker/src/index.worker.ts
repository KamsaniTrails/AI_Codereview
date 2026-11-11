import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getConfig,
  logger,
  type IndexJobPayload,
  jobFailuresTotal
} from '@ai-reviewer/core';
import { dbService } from '@ai-reviewer/db';
import { RepositoryIndexer } from '@ai-reviewer/indexer';

export function startIndexWorker(redisUrl?: string): Worker<IndexJobPayload> {
  const config = getConfig();
  const url = redisUrl || config.REDIS_URL;
  const connection = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  const indexer = new RepositoryIndexer();
  l
  const worker = new Worker<IndexJobPayload>(
    'index',
    async (job: Job<IndexJobPayload>) => {
      logger.info(
        { repo: job.data.repoFullName, repoId: job.data.repoId, commitSha: job.data.commitSha },
        'Index worker processing repository'
      );

      // 1. Mark status as INDEXING
      await dbService.updateRepoIndexStatus(job.data.repoId, 'INDEXING', null, null);

      try {
        // Run real AST chunking and embedding
        const result = await indexer.indexRepository({
          repoId: job.data.repoId,
          workingDir: '.',
          commitSha: job.data.commitSha
        });

        // 2. Mark status as INDEXED only when real indexing succeeds
        await dbService.updateRepoIndexStatus(job.data.repoId, 'INDEXED', job.data.commitSha, null);
        logger.info(
          { repoId: job.data.repoId, totalChunks: result.totalChunks, embeddedChunks: result.embeddedChunks },
          'Repository successfully indexed'
        );
      } catch (err: any) {
        // 3. Mark status as FAILED with the exact error message
        logger.error({ repoId: job.data.repoId, err: err.message }, 'Repository indexing failed');
        await dbService.updateRepoIndexStatus(job.data.repoId, 'FAILED', null, err.message);
        throw err;
      }
    },
    {
      connection: connection as any,
      concurrency: 2
    }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Index job failed');
    jobFailuresTotal.inc({ queue_name: 'index', error_type: err.name || 'Error' });
    if (job?.data?.repoId) {
      await dbService.updateRepoIndexStatus(job.data.repoId, 'FAILED', null, err.message);
    }
  });

  return worker;
}

