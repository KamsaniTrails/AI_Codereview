import { describe, it, expect } from 'vitest';
import { postProcessFindings } from './postProcessor.js';
import type { Finding, ChangedFile, RepoSettings } from '@ai-reviewer/core';

describe('packages/agents', () => {
  it('deduplicates overlapping findings and boosts confidence from static analysis', () => {
    const rawFindings: Finding[] = [
      {
        agent: 'bug',
        file: 'src/app.ts',
        lineStart: 10,
        lineEnd: 12,
        severity: 'high',
        category: 'bug',
        title: 'Missing null check',
        message: 'Object might be undefined',
        evidence: 'user.name',
        confidence: 0.80,
        fingerprint: 'fp-1'
      },
      {
        agent: 'quality',
        file: 'src/app.ts',
        lineStart: 11,
        lineEnd: 12,
        severity: 'medium',
        category: 'bug',
        title: 'Missing null check',
        message: 'Potential crash on missing user profile',
        evidence: 'user.name line 11',
        confidence: 0.85,
        fingerprint: 'fp-1'
      }
    ];

    const changedFiles: ChangedFile[] = [
      {
        filename: 'src/app.ts',
        status: 'modified',
        additions: 5,
        deletions: 1,
        changes: 6,
        validDiffLines: new Set([10, 11, 12])
      }
    ];

    const settings: RepoSettings = {
      confidenceThreshold: 0.70,
      enabledAgents: ['bug', 'security', 'quality', 'test'],
      ignoreGlobs: [],
      maxComments: 5,
      reviewDrafts: false,
      maxFileSizeKb: 200
    };

    const result = postProcessFindings(rawFindings, {
      settings,
      changedFiles,
      staticFindings: [{ ...rawFindings[0], agent: 'static:builtin-ast' }]
    });

    // Should deduplicate to 1 finding and boost confidence by +0.10
    expect(result.inlineFindings.length).toBe(1);
    expect(result.inlineFindings[0].confidence).toBeGreaterThanOrEqual(0.90);
    expect(result.inlineFindings[0].message).toContain('Confirmed by static analysis');
  });

  it('filters out findings on lines not inside the diff', () => {
    const rawFindings: Finding[] = [
      {
        agent: 'security',
        file: 'src/app.ts',
        lineStart: 99, // Line 99 is not in validDiffLines
        lineEnd: 99,
        severity: 'medium',
        category: 'security',
        title: 'Old unused variable',
        message: 'Clean up old variables',
        evidence: 'var x = 1;',
        confidence: 0.85
      }
    ];

    const changedFiles: ChangedFile[] = [
      {
        filename: 'src/app.ts',
        status: 'modified',
        additions: 2,
        deletions: 0,
        changes: 2,
        validDiffLines: new Set([1, 2])
      }
    ];

    const settings: RepoSettings = {
      confidenceThreshold: 0.60,
      enabledAgents: ['bug', 'security', 'quality', 'test'],
      ignoreGlobs: [],
      maxComments: 10,
      reviewDrafts: false,
      maxFileSizeKb: 200
    };

    const result = postProcessFindings(rawFindings, {
      settings,
      changedFiles
    });

    // Line 99 is not inside the diff, so it should NOT be an inline comment
    expect(result.inlineFindings.length).toBe(0);
    expect(result.summaryOnlyFindings.length).toBe(1);
  });
});

