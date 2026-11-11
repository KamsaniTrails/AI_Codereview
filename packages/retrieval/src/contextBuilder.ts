import type { CodeChunk, ContextPack, ChangedFile } from '@ai-reviewer/core';
import { logger } from '@ai-reviewer/core';
import { dbService } from '@ai-reviewer/db';
import { createEmbeddingClient, type IEmbeddingClient } from '@ai-reviewer/llm';
import { reciprocalRankFusion } from './rrf.js';

export interface ContextBuilderOptions {
  repoId: string;
  tokenBudget?: number; // default 7000 tokens (~28,000 characters)
  embeddingClient?: IEmbeddingClient;
}

export class ContextBuilder {
  private embeddingClient: IEmbeddingClient;

  constructor(embeddingClient?: IEmbeddingClient) {
    this.embeddingClient = embeddingClient || createEmbeddingClient();
  }

  /**
   * Constructs a comprehensive ContextPack for a changed file or symbol.
   */
  public async buildContext(
    repoId: string,
    file: ChangedFile,
    symbolName?: string,
    conventions?: string,
    signal?: AbortSignal
  ): Promise<ContextPack> {
    logger.debug({ repoId, file: file.filename, symbolName }, 'Building context pack');

    let changedSymbol: CodeChunk | undefined;
    let callers: CodeChunk[] = [];
    let callees: CodeChunk[] = [];
    let semanticChunks: CodeChunk[] = [];
    let keywordChunks: CodeChunk[] = [];
    let testChunks: CodeChunk[] = [];

    // 1. Semantic search based on patch / changed code
    const searchText = symbolName || file.patch || file.filename;
    try {
      const queryVec = await this.embeddingClient.getEmbedding(searchText, signal);
      semanticChunks = await dbService.searchSimilarChunks(repoId, queryVec, 8);
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Semantic search failed in context builder');
    }

    // 2. Keyword search based on identifier tokens
    try {
      const identifiers = this.extractQueryTokens(searchText);
      if (identifiers) {
        keywordChunks = await dbService.searchKeywordChunks(repoId, identifiers, 8);
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Keyword search failed in context builder');
    }

    // 3. Call graph callers & callees if symbolName is available
    if (symbolName && symbolName !== '<root>') {
      try {
        callers = await dbService.findCallers(repoId, symbolName, 5);
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Callers retrieval failed');
      }
    }

    // 4. Test chunks referencing the file or symbol
    const baseName = file.filename.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
    if (baseName) {
      try {
        const potentialTests = await dbService.searchKeywordChunks(repoId, `${baseName} test`, 4);
        testChunks = potentialTests.filter(c =>
          c.filePath.includes('.test.') ||
          c.filePath.includes('.spec.') ||
          c.filePath.includes('tests/') ||
          c.filePath.includes('__tests__/')
        );
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Test chunks retrieval failed');
      }
    }

    // 5. Merge semantic & keyword chunks using Reciprocal Rank Fusion (RRF)
    const fusedChunks = reciprocalRankFusion([semanticChunks, keywordChunks], 60);

    // 6. Token budget trimming (approx 4 chars per token)
    const charBudget = 28000; // ~7000 tokens
    const trimmedSemantic: CodeChunk[] = [];
    let totalChars = (conventions?.length || 0);

    for (const chunk of fusedChunks) {
      if (totalChars + chunk.content.length > charBudget) break;
      trimmedSemantic.push(chunk);
      totalChars += chunk.content.length;
    }

    return {
      changedSymbol,
      callers,
      callees,
      semanticChunks: trimmedSemantic,
      keywordChunks,
      testChunks,
      conventions
    };
  }

  private extractQueryTokens(text: string): string {
    const tokens = text
      .replace(/[^a-zA-Z0-9_$]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !/^(const|let|var|function|return|import|export|from|class|if|else|for|while)$/.test(t));

    return Array.from(new Set(tokens)).slice(0, 10).join(' ');
  }
}

export const contextBuilder = new ContextBuilder();

