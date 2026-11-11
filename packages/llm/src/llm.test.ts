import { describe, it, expect } from 'vitest';
import { MockLlmAdapter } from './mock.js';
import { MockEmbeddingAdapter } from './embedding.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { FindingsListSchema } from '@ai-reviewer/core';

describe('packages/llm', () => {
  it('generates findings for security injection code via MockLlmAdapter', async () => {
    const mock = new MockLlmAdapter();
    const prompt = 'File: src/db/users.ts\nconst query = "SELECT * FROM users WHERE id = " + userId;';
    
    const res = await mock.generateStructuredOutput({
      messages: [{ role: 'user', content: prompt }],
      schema: FindingsListSchema
    });

    expect(res.data.length).toBeGreaterThan(0);
    const finding = res.data[0];
    expect(finding.category).toBe('security');
    expect(finding.severity).toBe('critical');
    expect(finding.title).toContain('SQL Injection');
  });

  it('produces normalized unit-length embeddings via MockEmbeddingAdapter', async () => {
    const embeddingClient = new MockEmbeddingAdapter(1536);
    const vec = await embeddingClient.getEmbedding('function authenticateUser(token: string) {}');

    expect(vec).toHaveLength(1536);
    let norm = 0;
    for (const v of vec) {
      norm += v * v;
    }
    // Length should be approximately 1.0 (unit vector)
    expect(Math.abs(norm - 1.0)).toBeLessThan(0.01);
  });

  it('circuit breaker transitions to OPEN after consecutive errors', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownPeriodMs: 1000 });
    expect(cb.canExecute()).toBe(true);

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');

    cb.recordFailure(); // Reached threshold (3)
    expect(cb.getState()).toBe('OPEN');
    expect(cb.canExecute()).toBe(false);
  });
});

