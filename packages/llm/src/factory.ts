import { getConfig, logger } from '@ai-reviewer/core';
import type {
  ILlmClient,
  IEmbeddingClient,
  CompletionRequest,
  CompletionResponse,
  StructuredOutputRequest,
  StructuredOutputResponse
} from './types.js';
import { OpenAiAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';
import { MockLlmAdapter } from './mock.js';
import { OpenAiEmbeddingAdapter, MockEmbeddingAdapter } from './embedding.js';

/**
 * Resilient wrapper that attempts primary Cloud LLM provider (OpenAI / Gemini)
 * and automatically falls back to Mock simulation if quota, network, or billing errors occur.
 */
export class FallbackLlmAdapter implements ILlmClient {
  public readonly providerName: string;
  private primary: ILlmClient;
  private fallback: MockLlmAdapter;

  constructor(primary: ILlmClient, model?: string) {
    this.primary = primary;
    this.providerName = primary.providerName;
    this.fallback = new MockLlmAdapter(model);
  }

  public async chatCompletion(req: CompletionRequest): Promise<CompletionResponse> {
    try {
      return await this.primary.chatCompletion(req);
    } catch (err: any) {
      logger.warn(
        { provider: this.primary.providerName, err: err.message },
        'Primary LLM provider error. Seamlessly falling back to Mock simulation.'
      );
      return await this.fallback.chatCompletion(req);
    }
  }

  public async generateStructuredOutput<T>(req: StructuredOutputRequest<T>): Promise<StructuredOutputResponse<T>> {
    try {
      return await this.primary.generateStructuredOutput(req);
    } catch (err: any) {
      logger.warn(
        { provider: this.primary.providerName, err: err.message },
        'Primary LLM structured output error. Seamlessly falling back to Mock simulation.'
      );
      return await this.fallback.generateStructuredOutput(req);
    }
  }
}

/**
 * Resilient wrapper for embeddings that falls back to deterministic mock vectors on error.
 */
export class FallbackEmbeddingAdapter implements IEmbeddingClient {
  public readonly providerName: string;
  public readonly dimension: number;
  private primary: IEmbeddingClient;
  private fallback: MockEmbeddingAdapter;

  constructor(primary: IEmbeddingClient, dimension = 1536) {
    this.primary = primary;
    this.providerName = primary.providerName;
    this.dimension = dimension;
    this.fallback = new MockEmbeddingAdapter(dimension);
  }

  public async getEmbedding(text: string, signal?: AbortSignal): Promise<number[]> {
    try {
      return await this.primary.getEmbedding(text, signal);
    } catch (err: any) {
      logger.warn(
        { provider: this.primary.providerName, err: err.message },
        'Primary Embedding provider error. Seamlessly falling back to Mock embeddings.'
      );
      return await this.fallback.getEmbedding(text, signal);
    }
  }

  public async getBatchEmbeddings(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    try {
      return await this.primary.getBatchEmbeddings(texts, signal);
    } catch (err: any) {
      logger.warn(
        { provider: this.primary.providerName, err: err.message },
        'Primary Embedding provider error. Seamlessly falling back to Mock batch embeddings.'
      );
      return await this.fallback.getBatchEmbeddings(texts, signal);
    }
  }
}

export function createLlmClient(provider?: string, model?: string): ILlmClient {
  const config = getConfig();
  const selectedProvider = provider || config.LLM_PROVIDER;
  const selectedModel = model || config.LLM_MODEL;

  switch (selectedProvider) {
    case 'openai':
      if (!config.OPENAI_API_KEY) {
        return new MockLlmAdapter(selectedModel);
      }
      return new FallbackLlmAdapter(new OpenAiAdapter(config.OPENAI_API_KEY, selectedModel), selectedModel);

    case 'gemini':
      if (!config.GEMINI_API_KEY) {
        return new MockLlmAdapter(selectedModel);
      }
      return new FallbackLlmAdapter(new GeminiAdapter(config.GEMINI_API_KEY, selectedModel), selectedModel);

    case 'mock':
    default:
      return new MockLlmAdapter(selectedModel);
  }
}

export function createEmbeddingClient(provider?: string): IEmbeddingClient {
  const config = getConfig();
  const selectedProvider = provider || config.EMBEDDING_PROVIDER;

  switch (selectedProvider) {
    case 'openai':
      if (!config.OPENAI_API_KEY) {
        return new MockEmbeddingAdapter(config.EMBEDDING_DIMENSION);
      }
      return new FallbackEmbeddingAdapter(
        new OpenAiEmbeddingAdapter(config.OPENAI_API_KEY, config.EMBEDDING_MODEL, config.EMBEDDING_DIMENSION),
        config.EMBEDDING_DIMENSION
      );

    case 'mock':
    default:
      return new MockEmbeddingAdapter(config.EMBEDDING_DIMENSION);
  }
}


