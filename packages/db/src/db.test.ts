import { describe, it, expect } from 'vitest';
import { DatabaseService } from './queries.js';

describe('packages/db', () => {
  const service = new DatabaseService();

  it('records webhook delivery idempotently', async () => {
    const deliveryId = 'delivery-test-123';
    const firstAttempt = await service.recordWebhookDelivery(deliveryId, 'pull_request');
    expect(firstAttempt).toBe(true);

    const secondAttempt = await service.recordWebhookDelivery(deliveryId, 'pull_request');
    expect(secondAttempt).toBe(false); // Rejected duplicate delivery
  });

  it('manages repositories and settings', async () => {
    const repo = await service.upsertRepo({
      installationId: 999,
      githubRepoId: 888777,
      fullName: 'org/test-repo',
      defaultBranch: 'main'
    });

    expect(repo.fullName).toBe('org/test-repo');
    expect(repo.settings.confidenceThreshold).toBe(0.60);

    const updated = await service.updateRepoSettings(repo.id, {
      confidenceThreshold: 0.85,
      maxComments: 5
    });

    expect(updated?.settings.confidenceThreshold).toBe(0.85);
    expect(updated?.settings.maxComments).toBe(5);
  });

  it('manages reviews, findings, and feedback loop', async () => {
    const repo = await service.upsertRepo({
      installationId: 100,
      githubRepoId: 200,
      fullName: 'owner/feedback-repo'
    });

    const review = await service.createReview({
      repoId: repo.id,
      prNumber: 1,
      headSha: 'abc1234',
      model: 'gpt-4o'
    });
    expect(review.status).toBe('queued');

    const findings = await service.saveFindings(review.id, [
      {
        agent: 'security',
        file: 'src/token.ts',
        lineStart: 10,
        lineEnd: 12,
        severity: 'critical',
        category: 'security',
        title: 'Hardcoded secret token',
        message: 'Do not commit raw API keys',
        evidence: 'const KEY = "12345"',
        confidence: 0.99,
        fingerprint: 'fp-secret-1'
      }
    ]);

    expect(findings).toHaveLength(1);

    // Add negative feedback (-1)
    await service.addFeedback({
      findingId: findings[0].id!,
      userLogin: 'lead-dev',
      value: -1,
      reason: 'This is a test dummy key, please ignore'
    });

    const unhelpful = await service.getUnhelpfulFingerprints(repo.id);
    expect(unhelpful.has('fp-secret-1')).toBe(true);
  });
});

