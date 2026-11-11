import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { CodeChunk, SymbolEdge } from '@ai-reviewer/core';
import { logger } from '@ai-reviewer/core';
import { dbService } from '@ai-reviewer/db';
import { createEmbeddingClient, type IEmbeddingClient } from '@ai-reviewer/llm';
import { chunkFile } from './chunker.js';

export interface IndexerOptions {
  repoId: string;
  workingDir: string;
  commitSha: string;
  embeddingClient?: IEmbeddingClient;
  signal?: AbortSignal;
}

export class RepositoryIndexer {
  private embeddingClient: IEmbeddingClient;

  constructor(embeddingClient?: IEmbeddingClient) {
    this.embeddingClient = embeddingClient || createEmbeddingClient();
  }

  /**
   * Scans a repository directory, chunks code by function/class,
   * embeds new chunks in batches, and upserts them to the database.
   */
  public async indexRepository(options: IndexerOptions): Promise<{ totalChunks: number; embeddedChunks: number }> {
    logger.info({ repoId: options.repoId, commitSha: options.commitSha }, 'Starting repository indexing');

    const files = await this.discoverSourceFiles(options.workingDir);
    logger.info({ count: files.length }, 'Discovered eligible source files for indexing');

    const allChunks: CodeChunk[] = [];
    const allEdges: SymbolEdge[] = [];
    let embeddedCount = 0;

    for (const relFile of files) {
      if (options.signal?.aborted) throw new Error('Indexing cancelled');

      try {
        const fullPath = path.join(options.workingDir, relFile);
        const stat = await fs.stat(fullPath);
        if (stat.size > 200 * 1024) continue; // Skip files > 200 KB

        const content = await fs.readFile(fullPath, 'utf-8');
        const { chunks, symbolCallsMap } = chunkFile(
          options.repoId,
          relFile,
          content,
          options.commitSha
        );

        allChunks.push(...chunks);

        // Build symbol edges for call graph
        for (const chunk of chunks) {
          const calls = symbolCallsMap.get(chunk.symbolName) || [];
          for (const targetName of calls) {
            allEdges.push({
              repoId: options.repoId,
              fromChunkId: chunk.id,
              toSymbolName: targetName,
              kind: 'calls'
            });
          }
        }
      } catch (err: any) {
        logger.warn({ err: err.message, file: relFile }, 'Failed to chunk source file');
      }
    }

    // Batch embed chunks that don't yet have vectors
    const batchSize = 25;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      if (options.signal?.aborted) throw new Error('Indexing cancelled');

      const batch = allChunks.slice(i, i + batchSize);
      const textsToEmbed = batch.map(c => c.content);

      try {
        const embeddings = await this.embeddingClient.getBatchEmbeddings(textsToEmbed, options.signal);
        for (let j = 0; j < batch.length; j++) {
          batch[j].embedding = embeddings[j];
        }
        embeddedCount += batch.length;
      } catch (err: any) {
        logger.error({ err: err.message }, 'Failed to generate embedding batch');
      }
    }

    // Persist chunks and call edges
    await dbService.upsertCodeChunks(allChunks);
    await dbService.upsertSymbolEdges(allEdges);

    logger.info(
      { repoId: options.repoId, totalChunks: allChunks.length, embeddedChunks: embeddedCount },
      'Repository indexing completed successfully'
    );

    return {
      totalChunks: allChunks.length,
      embeddedChunks: embeddedCount
    };
  }

  /**
   * Recursively walks repository directory to discover source files,
   * skipping node_modules, build artifacts, and vendor files.
   */
  private async discoverSourceFiles(dir: string, baseDir = dir): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === 'vendor' ||
          entry.name === '__pycache__'
        ) {
          continue;
        }
        const sub = await this.discoverSourceFiles(fullPath, baseDir);
        results.push(...sub);
      } else if (entry.isFile()) {
        if (/\.(ts|tsx|js|jsx|py)$/.test(entry.name)) {
          results.push(relPath);
        }
      }
    }

    return results;
  }
}

