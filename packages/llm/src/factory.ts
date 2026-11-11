import { getConfig } from '@ai-reviewer/core';
import type { ILlmClient, IEmbeddingClient } from './types.js';
import { OpenAiAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';
import { MockLlmAdapter } from './mock.js';
import { OpenAiEmbeddingAdapter, MockEmbeddingAdapter } from './embedding.js';

export function createLlmClient(provider?: string, model?: string): ILlmClient {
  const config = getConfig();
  const selectedProvider = provider || config.LLM_PROVIDER;
  const selectedModel = model || config.LLM_MODEL;

  switch (selectedProvider) {
    case 'openai':
      if (!config.OPENAI_API_KEY) {
        return new MockLlmAdapter(selectedModel);
      }
      return new OpenAiAdapter(config.OPENAI_API_KEY, selectedModel);
    case 'gemini':
      if (!config.GEMINI_API_KEY) {
        return new MockLlmAdapter(selectedModel);
      }
      return new GeminiAdapter(config.GEMINI_API_KEY, selectedModel);
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
      return new OpenAiEmbeddingAdapter(config.OPENAI_API_KEY, config.EMBEDDING_MODEL, config.EMBEDDING_DIMENSION);
    case 'mock':
    default:
      return new MockEmbeddingAdapter(config.EMBEDDING_DIMENSION);
  }
}

