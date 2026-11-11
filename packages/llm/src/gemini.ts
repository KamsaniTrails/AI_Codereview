import type { ILlmClient, CompletionRequest, CompletionResponse, StructuredOutputRequest, StructuredOutputResponse } from './types.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { logger, llmTokensTotal } from '@ai-reviewer/core';

export class GeminiAdapter implements ILlmClient {
  public readonly providerName = 'gemini';
  private apiKey: string;
  private model: string;
  private circuitBreaker = new CircuitBreaker();

  constructor(apiKey: string, model = 'gemini-1.5-pro') {
    this.apiKey = apiKey;
    this.model = model;
  }

  public async chatCompletion(req: CompletionRequest): Promise<CompletionResponse> {
    if (!this.circuitBreaker.canExecute()) {
      throw new Error('LLM Circuit Breaker is OPEN. Gemini provider paused briefly.');
    }

    const contents = req.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: req.temperature ?? 0,
            maxOutputTokens: req.maxTokens
          }
        }),
        signal: req.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.circuitBreaker.recordFailure();
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      const resData = await response.json() as any;
      this.circuitBreaker.recordSuccess();

      const candidate = resData.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || null;
      const tokensIn = resData.usageMetadata?.promptTokenCount || 0;
      const tokensOut = resData.usageMetadata?.candidatesTokenCount || 0;
      const costUsd = (tokensIn * 0.00000125) + (tokensOut * 0.000005);

      llmTokensTotal.inc({ direction: 'in', agent: 'all', model: this.model }, tokensIn);
      llmTokensTotal.inc({ direction: 'out', agent: 'all', model: this.model }, tokensOut);

      return {
        content: text,
        tokensIn,
        tokensOut,
        costUsd,
        model: this.model
      };
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      logger.error({ err: err.message, model: this.model }, 'Gemini completion failed');
      throw err;
    }
  }

  public async generateStructuredOutput<T>(req: StructuredOutputRequest<T>): Promise<StructuredOutputResponse<T>> {
    const prompt = `${req.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}\n\nYou must respond with strictly valid JSON without any markdown code fences.`;
    const res = await this.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      signal: req.signal
    });

    const clean = (res.content || '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(clean);
    const validated = req.schema.parse(parsed);

    return {
      data: validated,
      rawText: clean,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd
    };
  }
}

