import type { z } from 'zod';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON schema
}

export interface CompletionRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CompletionResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
}

export interface StructuredOutputRequest<T> {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaName?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StructuredOutputResponse<T> {
  data: T;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface ILlmClient {
  readonly providerName: string;
  chatCompletion(req: CompletionRequest): Promise<CompletionResponse>;
  generateStructuredOutput<T>(req: StructuredOutputRequest<T>): Promise<StructuredOutputResponse<T>>;
}

export interface IEmbeddingClient {
  readonly providerName: string;
  readonly dimension: number;
  getEmbedding(text: string, signal?: AbortSignal): Promise<number[]>;
  getBatchEmbeddings(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

