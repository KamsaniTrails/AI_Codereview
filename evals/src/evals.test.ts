import { describe, it, expect } from 'vitest';
import { BENCHMARK_CASES } from './dataset.js';
import { evaluateCase, aggregateBenchmarkMetrics } from './metrics.js';
import type { Finding } from '@ai-reviewer/core';

describe('evals benchmark suite', () => {
  it('contains at least 30 benchmark cases spanning real bugs, injected bugs, and clean PRs', () => {
    expect(BENCHMARK_CASES.length).toBeGreaterThanOrEqual(30);

    const realBugs = BENCHMARK_CASES.filter(c => c.type === 'real_bug');
    const injectedBugs = BENCHMARK_CASES.filter(c => c.type === 'injected_bug');
    const cleanPrs = BENCHMARK_CASES.filter(c => c.type === 'clean_pr');

    expect(realBugs.length).toBeGreaterThanOrEqual(10);
    expect(injectedBugs.length).toBeGreaterThanOrEqual(10);
    expect(cleanPrs.length).toBeGreaterThanOrEqual(10);
  });

  it('correctly calculates precision, recall, and false positive metrics', () => {
    const testCase = BENCHMARK_CASES[0]; // SQL injection case
    const mockFinding: Finding = {
      agent: 'security',
      file: testCase.expectedFindings[0].file,
      lineStart: testCase.expectedFindings[0].lineRange[0],
      lineEnd: testCase.expectedFindings[0].lineRange[1],
      severity: 'critical',
      category: 'security',
      title: 'SQL Injection Vulnerability',
      message: 'Unsafe raw query string concatenation',
      evidence: 'query = "SELECT * FROM users WHERE id = " + id',
      confidence: 0.95
    };

    const res = evaluateCase(testCase, [mockFinding], true, 100, 50, 0.001, 250);
    expect(res.matchedCount).toBe(1);
    expect(res.falsePositivesCount).toBe(0);

    const aggregated = aggregateBenchmarkMetrics([res]);
    expect(aggregated.precision).toBe(1.0);
    expect(aggregated.recall).toBe(1.0);
    expect(aggregated.locationAccuracy).toBe(1.0);
  });
});

