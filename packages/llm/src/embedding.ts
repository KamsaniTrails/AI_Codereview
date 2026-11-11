import type { IEmbeddingClient } from './types.js';
import crypto from 'node:crypto';
import { logger } from '@ai-reviewer/core';

export class OpenAiEmbeddingAdapter implements IEmbeddingClient {
  public readonly providerName = 'openai';
  public readonly dimension: number;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'text-embedding-3-small', dimension = 1536) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimension = dimension;
  }

  public async getEmbedding(text: string, signal?: AbortSignal): Promise<number[]> {
    const batch = await this.getBatchEmbeddings([text], signal);
    return batch[0];
  }

  public async getBatchEmbeddings(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          input: texts
        }),
        signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI Embedding API error (${response.status}): ${text}`);
      }

      const data = await response.json() as any;
      return data.data.map((item: any) => item.embedding);
    } catch (err: any) {
      logger.error({ err: err.message, model: this.model }, 'Failed to compute embeddings');
      throw err;
    }
  }
}

/**
 * Deterministic pseudo-semantic embedding generator for offline testing.
 * Maps tokens into a normalized 1536-dimensional vector space.
 */
export class MockEmbeddingAdapter implements IEmbeddingClient {
  public readonly providerName = 'mock';
  public readonly dimension: number;

  constructor(dimension = 1536) {
    this.dimension = dimension;
  }

  public async getEmbedding(text: string): Promise<number[]> {
    return this.generateDeterministicVector(text);
  }

  public async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(t => this.generateDeterministicVector(t));
  }

  private generateDeterministicVector(text: string): number[] {
    const vec = new Float64Array(this.dimension);
    const tokens = text.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);

    for (const token of tokens) {
      const hash = crypto.createHash('md5').update(token).digest();
      for (let i = 0; i < 16; i++) {
        const idx = (hash[i] * 97 + i * 31) % this.dimension;
        vec[idx] += 1.0;
      }
    }

    // Normalize to unit length for cosine similarity
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm === 0) norm = 1;

    const result = new Array(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      result[i] = parseFloat((vec[i] / norm).toFixed(6));
    }
    return result;
  }
}

