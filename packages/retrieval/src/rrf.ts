import type { CodeChunk } from '@ai-reviewer/core';

export interface RankedChunk {
  chunk: CodeChunk;
  score: number;
}

/**
 * Reciprocal Rank Fusion (RRF) algorithm.
 * Combines rankings from multiple retrieval techniques (e.g., Semantic Vector + Keyword Full-Text).
 * Formula: RRF_score(d) = sum(1 / (k + rank_i(d)))
 * where k is a smoothing constant (standard default is 60).
 */
export function reciprocalRankFusion(
  rankingLists: CodeChunk[][],
  k = 60
): CodeChunk[] {
  const scores = new Map<string, { chunk: CodeChunk; score: number }>();

  for (const list of rankingLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const chunk = list[rank];
      if (!chunk.id) continue;

      const rrfContribution = 1.0 / (k + rank + 1);
      const existing = scores.get(chunk.id);

      if (existing) {
        existing.score += rrfContribution;
      } else {
        scores.set(chunk.id, {
          chunk,
          score: rrfContribution
        });
      }
    }
  }

  // Sort descending by merged RRF score
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(item => item.chunk);
}

