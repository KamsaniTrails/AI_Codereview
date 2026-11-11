import type { EvalCase, Finding, EvalRunMetrics } from '@ai-reviewer/core';

export interface CaseEvaluationResult {
  caseId: string;
  caseType: EvalCase['type'];
  expectedCount: number;
  postedCount: number;
  matchedCount: number;
  falsePositivesCount: number;
  locationMatches: number;
  contextRetrieved: boolean;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
}

export function evaluateCase(
  testCase: EvalCase,
  actualFindings: Finding[],
  contextWasRetrieved = true,
  tokensIn = 0,
  tokensOut = 0,
  costUsd = 0,
  latencyMs = 0
): CaseEvaluationResult {
  let matchedCount = 0;
  let locationMatches = 0;
  const matchedExpected = new Set<number>();

  for (const finding of actualFindings) {
    let matchedIndex = -1;

    for (let i = 0; i < testCase.expectedFindings.length; i++) {
      if (matchedExpected.has(i)) continue;

      const expected = testCase.expectedFindings[i];
      const sameFile = finding.file.toLowerCase().replace(/\\/g, '/') === expected.file.toLowerCase().replace(/\\/g, '/');
      const categoryMatch = finding.category === expected.category || (finding.severity === 'critical' && expected.severity === 'critical');

      if (sameFile && categoryMatch) {
        // Line proximity check within 3 lines tolerance
        const [expStart, expEnd] = expected.lineRange;
        const lineOverlap = Math.max(0, Math.min(finding.lineEnd, expEnd) - Math.max(finding.lineStart, expStart) + 1);
        const distance = Math.min(
          Math.abs(finding.lineStart - expStart),
          Math.abs(finding.lineEnd - expEnd)
        );

        if (lineOverlap > 0 || distance <= 3) {
          matchedIndex = i;
          if (distance <= 3) {
            locationMatches++;
          }
          break;
        }
      }
    }

    if (matchedIndex !== -1) {
      matchedExpected.add(matchedIndex);
      matchedCount++;
    }
  }

  const falsePositivesCount = Math.max(0, actualFindings.length - matchedCount);

  return {
    caseId: testCase.id,
    caseType: testCase.type,
    expectedCount: testCase.expectedFindings.length,
    postedCount: actualFindings.length,
    matchedCount,
    falsePositivesCount,
    locationMatches,
    contextRetrieved: contextWasRetrieved,
    tokensIn,
    tokensOut,
    costUsd,
    latencyMs
  };
}

export function aggregateBenchmarkMetrics(results: CaseEvaluationResult[]): EvalRunMetrics {
  let totalExpected = 0;
  let totalPosted = 0;
  let totalMatched = 0;
  let totalLocationMatches = 0;
  let cleanPrCount = 0;
  let cleanPrFindings = 0;
  let contextHitCount = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;

  for (const r of results) {
    totalExpected += r.expectedCount;
    totalPosted += r.postedCount;
    totalMatched += r.matchedCount;
    totalLocationMatches += r.locationMatches;
    if (r.contextRetrieved) contextHitCount++;
    totalTokensIn += r.tokensIn;
    totalTokensOut += r.tokensOut;
    totalCostUsd += r.costUsd;
    totalLatencyMs += r.latencyMs;

    if (r.caseType === 'clean_pr') {
      cleanPrCount++;
      cleanPrFindings += r.postedCount;
    }
  }

  const precision = totalPosted > 0 ? totalMatched / totalPosted : 1.0;
  const recall = totalExpected > 0 ? totalMatched / totalExpected : 1.0;
  const falsePositiveRate = cleanPrCount > 0 ? cleanPrFindings / cleanPrCount : 0.0;
  const locationAccuracy = totalMatched > 0 ? totalLocationMatches / totalMatched : 1.0;
  const noise = results.length > 0 ? totalPosted / results.length : 0.0;
  const avgCostUsd = results.length > 0 ? totalCostUsd / results.length : 0.0;
  const avgLatencyMs = results.length > 0 ? totalLatencyMs / results.length : 0.0;
  const retrievalHitRate = results.length > 0 ? contextHitCount / results.length : 1.0;

  return {
    precision: parseFloat(precision.toFixed(4)),
    recall: parseFloat(recall.toFixed(4)),
    falsePositiveRate: parseFloat(falsePositiveRate.toFixed(4)),
    locationAccuracy: parseFloat(locationAccuracy.toFixed(4)),
    noise: parseFloat(noise.toFixed(2)),
    avgTokensIn: Math.round(totalTokensIn / (results.length || 1)),
    avgTokensOut: Math.round(totalTokensOut / (results.length || 1)),
    avgCostUsd: parseFloat(avgCostUsd.toFixed(6)),
    avgLatencyMs: Math.round(avgLatencyMs),
    retrievalHitRate: parseFloat(retrievalHitRate.toFixed(4))
  };
}

