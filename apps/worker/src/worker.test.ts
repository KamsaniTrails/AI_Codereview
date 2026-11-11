import { describe, it, expect } from 'vitest';
import { ReviewPipeline } from './pipeline/reviewPipeline.js';
import { dbService } from '@ai-reviewer/db';
import type { GitHubClient, PostReviewComment } from '@ai-reviewer/github';
import type { ChangedFile } from '@ai-reviewer/core';

describe('apps/worker ReviewPipeline', () => {
  it('executes the 13 stages, saves findings, and posts comments to GitHub', async () => {
    // 1. Setup mock repo in db
    const repo = await dbService.upsertRepo({
      installationId: 101,
      githubRepoId: 9901,
      fullName: 'org/demo-service'
    });

    const postedReviews: { prNumber: number; summary: string; comments: PostReviewComment[] }[] = [];

    // Mock GitHub Client
    const mockClient = {
      createCheckRun: async () => 12345,
      updateCheckRun: async () => {},
      getPullRequestHeadSha: async () => 'commit-sha-abc',
      getPullRequestFiles: async (): Promise<ChangedFile[]> => [
        {
          filename: 'src/auth/token.ts',
          status: 'modified',
          additions: 10,
          deletions: 2,
          changes: 12,
          patch: `@@ -1,5 +1,8 @@\n export function getToken() {\n-  return null;\n+  const key = "mock_token_1234567890abcdef1234567890";\n+  return key;\n }`,
          validDiffLines: new Set([1, 2, 3, 4, 5, 6, 7, 8])
        }
      ],
      getFileContent: async () => `
        export function getToken() {
          const key = "mock_token_1234567890abcdef1234567890";
          return key;
        }
      `,
      postReview: async (prNumber: number, commitSha: string, summary: string, comments: PostReviewComment[]) => {
        postedReviews.push({ prNumber, summary, comments });
        return { reviewId: 777 };
      }
    } as unknown as GitHubClient;

    const pipeline = new ReviewPipeline({
      authService: {
        getInstallationToken: async () => 'mock-token'
      } as any,
      githubClientFactory: () => mockClient
    });

    await pipeline.execute({
      installationId: 101,
      repoId: repo.id,
      repoFullName: repo.fullName,
      prNumber: 42,
      headSha: 'commit-sha-abc',
      baseSha: 'base-sha-123',
      deliveryId: 'delivery-test-run'
    });

    expect(postedReviews).toHaveLength(1);
    expect(postedReviews[0].prNumber).toBe(42);
    expect(postedReviews[0].comments.length).toBeGreaterThan(0);
    expect(postedReviews[0].comments[0].body).toContain('CRITICAL');

    // Verify findings were persisted in DB
    const reviews = await dbService.getReviews(repo.id);
    expect(reviews.length).toBeGreaterThan(0);
    const review = reviews.find(r => r.prNumber === 42);
    expect(review?.status).toBe('done');
  });
});

