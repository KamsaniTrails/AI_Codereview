import { describe, it, expect } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createServer } from './server.js';
import { getConfig } from '@ai-reviewer/core';
import { dbService } from '@ai-reviewer/db';

describe('apps/api Webhooks & Repository Management', () => {
  const app = createServer();
  const config = getConfig();

  const createWebhookSignature = (body: string, secret = config.GITHUB_WEBHOOK_SECRET) => {
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return `sha256=${hmac}`;
  };

  it('GET /healthz returns 200 OK', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // 1. Signature Verification: Missing header
  it('POST /webhooks/github rejects request with missing X-Hub-Signature-256 header (401)', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', 'missing-sig-test-1')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('signature');
  });

  // 2. Signature Verification: Invalid HMAC signature
  it('POST /webhooks/github rejects request with invalid HMAC signature (401)', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const badSignature = createWebhookSignature(payload, 'wrong-secret-key-for-test');

    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', 'bad-sig-test-2')
      .set('X-Hub-Signature-256', badSignature)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid HMAC signature');
  });

  // 3. Signature Verification: Valid signature accepted
  it('POST /webhooks/github verifies valid HMAC signature and accepts webhook', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      number: 101,
      pull_request: {
        number: 101,
        title: 'Fix authentication vulnerability',
        state: 'open',
        user: { login: 'octocat', type: 'User' },
        head: { sha: 'sha1234567890abcdef', ref: 'fix/auth' },
        base: { sha: 'base1234567890abcdef', ref: 'main' }
      },
      repository: {
        id: 998877,
        name: 'web-app',
        full_name: 'acme/web-app',
        default_branch: 'main',
        owner: { login: 'acme' }
      },
      installation: {
        id: 4567
      }
    });

    const signature = createWebhookSignature(payload);
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', 'delivery-valid-test-1')
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(res.status).toBe(202);
    expect(res.body.reviewStatus).toBe('queued');
  });

  // 4. Duplicate Delivery Idempotency Check
  it('POST /webhooks/github returns 200 without reprocessing when delivery ID is duplicate', async () => {
    const deliveryId = `duplicate-delivery-check-${Date.now()}`;
    const payload = JSON.stringify({
      action: 'opened',
      number: 102,
      pull_request: {
        number: 102,
        title: 'Refactor logging',
        state: 'open',
        user: { login: 'alice', type: 'User' },
        head: { sha: 'sha2222222222abcdef', ref: 'refactor/logs' },
        base: { sha: 'base2222222222abcdef', ref: 'main' }
      },
      repository: {
        id: 998878,
        name: 'core-service',
        full_name: 'acme/core-service',
        default_branch: 'main',
        owner: { login: 'acme' }
      },
      installation: {
        id: 4567
      }
    });

    const signature = createWebhookSignature(payload);

    // First delivery attempt -> accepted
    const res1 = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(res1.status).toBe(202);

    // Second delivery attempt with exact same deliveryId -> returns 200 duplicate message
    const res2 = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.message).toContain('Delivery already processed');
  });

  // 5. Installation Lifecycle Webhook (created and installation_repositories added/removed)
  it('POST /webhooks/github handles installation_repositories added and removed events', async () => {
    const addPayload = JSON.stringify({
      action: 'added',
      installation: { id: 7788 },
      repositories_added: [
        { id: 501, name: 'billing-api', full_name: 'acme/billing-api' }
      ],
      repositories_removed: []
    });

    const addRes = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'installation_repositories')
      .set('X-GitHub-Delivery', `delivery-add-${Date.now()}`)
      .set('X-Hub-Signature-256', createWebhookSignature(addPayload))
      .send(addPayload);

    expect(addRes.status).toBe(200);

    // Verify repo is in database
    const repoInDb = await dbService.getRepoByFullName('acme/billing-api');
    expect(repoInDb).not.toBeNull();
    expect(repoInDb?.fullName).toBe('acme/billing-api');
    expect(repoInDb?.indexStatus.toUpperCase()).toBe('PENDING');

    // Remove repo via installation_repositories removed
    const removePayload = JSON.stringify({
      action: 'removed',
      installation: { id: 7788 },
      repositories_added: [],
      repositories_removed: [
        { id: 501, name: 'billing-api', full_name: 'acme/billing-api' }
      ]
    });

    const removeRes = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'installation_repositories')
      .set('X-GitHub-Delivery', `delivery-remove-${Date.now()}`)
      .set('X-Hub-Signature-256', createWebhookSignature(removePayload))
      .send(removePayload);

    expect(removeRes.status).toBe(200);
    const removedFromDb = await dbService.getRepoByFullName('acme/billing-api');
    expect(removedFromDb).toBeNull();
  });

  // 6. Installation Sync REST Endpoint
  it('POST /api/installations/sync syncs repositories and enqueues indexing', async () => {
    const res = await request(app)
      .post('/api/installations/sync')
      .send({
        installationId: 8899,
        mockRepositories: [
          { id: 601, name: 'auth-gateway', full_name: 'acme/auth-gateway', default_branch: 'main' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);

    const saved = await dbService.getRepoByFullName('acme/auth-gateway');
    expect(saved).not.toBeNull();
    expect(saved?.indexStatus.toUpperCase()).toBe('PENDING');
  });

  // 7. GET /api/repos returns real database records
  it('GET /api/repos returns list of repositories from database', async () => {
    const res = await request(app).get('/api/repos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r: any) => r.fullName === 'acme/auth-gateway')).toBe(true);
  });

  // 8. POST /api/repos/:id/reindex triggers reindexing
  it('POST /api/repos/:id/reindex sets status to PENDING and enqueues job', async () => {
    const repo = await dbService.getRepoByFullName('acme/auth-gateway');
    expect(repo).toBeDefined();

    // Artificially mark as failed to test retry
    await dbService.updateRepoIndexStatus(repo!.id, 'FAILED', null, 'Cloning error occurred');

    const res = await request(app).post(`/api/repos/${repo!.id}/reindex`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Reindexing queued');
    expect(res.body.repo.indexStatus.toUpperCase()).toBe('PENDING');
    expect(res.body.repo.indexError).toBeNull();
  });
});
