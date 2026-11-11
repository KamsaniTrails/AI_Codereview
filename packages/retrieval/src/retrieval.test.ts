import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from './rrf.js';
import type { CodeChunk } from '@ai-reviewer/core';

describe('packages/retrieval', () => {
  it('combines rankings using Reciprocal Rank Fusion correctly', () => {
    const chunkA: CodeChunk = {
      id: 'chunk-a',
      repoId: 'repo-1',
      filePath: 'src/a.ts',
      symbolName: 'funcA',
      symbolKind: 'function',
      language: 'typescript',
      startLine: 1,
      endLine: 10,
      content: 'function funcA() {}',
      contentHash: 'hash-a',
      commitSha: 'sha-1'
    };

    const chunkB: CodeChunk = {
      id: 'chunk-b',
      repoId: 'repo-1',
      filePath: 'src/b.ts',
      symbolName: 'funcB',
      symbolKind: 'function',
      language: 'typescript',
      startLine: 1,
      endLine: 10,
      content: 'function funcB() {}',
      contentHash: 'hash-b',
      commitSha: 'sha-1'
    };

    const chunkC: CodeChunk = {
      id: 'chunk-c',
      repoId: 'repo-1',
      filePath: 'src/c.ts',
      symbolName: 'funcC',
      symbolKind: 'function',
      language: 'typescript',
      startLine: 1,
      endLine: 10,
      content: 'function funcC() {}',
      contentHash: 'hash-c',
      commitSha: 'sha-1'
    };

    // List 1 (semantic): [A, B]
    // List 2 (keyword): [B, C]
    // Chunk B appears in both lists, so its merged RRF score will be highest
    const merged = reciprocalRankFusion([[chunkA, chunkB], [chunkB, chunkC]], 60);

    expect(merged.length).toBe(3);
    expect(merged[0].id).toBe('chunk-b');
  });
});

