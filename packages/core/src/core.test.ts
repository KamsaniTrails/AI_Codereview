import { describe, it, expect } from 'vitest';
import { FindingSchema, RepoSettingsSchema } from './schemas.js';
import { computeFindingFingerprint, normalizeTitle } from './fingerprint.js';

describe('packages/core', () => {
  it('validates a correct finding', () => {
    const validFinding = {
      file: 'src/auth/login.ts',
      lineStart: 42,
      lineEnd: 45,
      severity: 'high' as const,
      category: 'security' as const,
      title: 'Password compared with ==',
      message: 'Why this is a problem and when it triggers.',
      evidence: 'The exact code lines that show it.',
      suggestion: 'Optional fixed code.',
      confidence: 0.82
    };

    const parsed = FindingSchema.safeParse(validFinding);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid finding missing required fields or bad confidence', () => {
    const invalidFinding = {
      file: '',
      lineStart: -1,
      lineEnd: 45,
      severity: 'extreme', // invalid severity
      category: 'security',
      title: 'hi', // too short
      message: 'bad',
      evidence: '',
      confidence: 1.5 // > 1
    };

    const parsed = FindingSchema.safeParse(invalidFinding);
    expect(parsed.success).toBe(false);
  });

  it('normalizes titles correctly', () => {
    expect(normalizeTitle('SQL  Injection (High Risk!)')).toBe('sql injection high risk');
  });

  it('generates consistent fingerprints across different title casings and spacing', () => {
    const f1 = {
      file: 'src/auth/login.ts',
      category: 'security' as const,
      title: 'SQL Injection detected in query()'
    };
    const f2 = {
      file: 'src/auth/login.ts',
      category: 'security' as const,
      title: 'sql injection detected in query'
    };

    const fp1 = computeFindingFingerprint(f1, 'authenticate');
    const fp2 = computeFindingFingerprint(f2, 'authenticate');

    expect(fp1).toBe(fp2);
  });

  it('defaults repo settings properly', () => {
    const settings = RepoSettingsSchema.parse({});
    expect(settings.confidenceThreshold).toBe(0.60);
    expect(settings.maxComments).toBe(10);
    expect(settings.reviewDrafts).toBe(false);
    expect(settings.enabledAgents).toContain('bug');
  });
});

