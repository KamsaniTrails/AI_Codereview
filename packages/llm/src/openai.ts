import type { ILlmClient, CompletionRequest, CompletionResponse, StructuredOutputRequest, StructuredOutputResponse } from './types.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { logger, llmTokensTotal } from '@ai-reviewer/core';

export class OpenAiAdapter implements ILlmClient {
  public readonly providerName = 'openai';
  private apiKey: string;
  private model: string;
  private circuitBreaker = new CircuitBreaker();

  constructor(apiKey: string, model = 'gpt-4o') {
    this.apiKey = apiKey;
    this.model = model;
  }

  public async chatCompletion(req: CompletionRequest): Promise<CompletionResponse> {
    if (!this.circuitBreaker.canExecute()) {
      throw new Error('LLM Circuit Breaker is OPEN. Provider paused briefly.');
    }

    const payload: Record<string, any> = {
      model: this.model,
      messages: req.messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {})
      })),
      temperature: req.temperature ?? 0
    };

    if (req.maxTokens) {
      payload.max_tokens = req.maxTokens;
    }

    if (req.tools && req.tools.length > 0) {
      payload.tools = req.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: req.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.circuitBreaker.recordFailure();
        throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
      }

      const resData = await response.json() as any;
      this.circuitBreaker.recordSuccess();

      const choice = resData.choices?.[0];
      const message = choice?.message;
      const tokensIn = resData.usage?.prompt_tokens || 0;
      const tokensOut = resData.usage?.completion_tokens || 0;
      // Approx cost calculation ($2.50 per 1M input, $10.00 per 1M output for gpt-4o)
      const costUsd = (tokensIn * 0.0000025) + (tokensOut * 0.00001);

      llmTokensTotal.inc({ direction: 'in', agent: 'all', model: this.model }, tokensIn);
      llmTokensTotal.inc({ direction: 'out', agent: 'all', model: this.model }, tokensOut);

      return {
        content: message?.content || null,
        toolCalls: message?.tool_calls,
        tokensIn,
        tokensOut,
        costUsd,
        model: this.model
      };
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      logger.error({ err: err.message, model: this.model }, 'OpenAI chat completion failed');
      throw err;
    }
  }

  public async generateStructuredOutput<T>(req: StructuredOutputRequest<T>): Promise<StructuredOutputResponse<T>> {
    const systemPrompt = `You must respond with ONLY valid JSON adhering to the specified schema. Do not include markdown codeblocks or explanations outside the JSON.`;
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...req.messages
    ];

    const res = await this.chatCompletion({
      messages,
      temperature: req.temperature ?? 0,
      maxTokens: req.maxTokens,
      signal: req.signal
    });

    const raw = (res.content || '').trim();
    const cleanJson = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    try {
      const parsedJson = JSON.parse(cleanJson);
      const validated = req.schema.parse(parsedJson);
      return {
        data: validated,
        rawText: cleanJson,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd
      };
    } catch (parseError: any) {
      // Retry once with validation error in prompt (spec page 16)
      logger.warn({ error: parseError.message }, 'Schema validation failed. Attempting one repair retry.');
      const repairMessages = [
        ...messages,
        { role: 'assistant' as const, content: raw },
        {
          role: 'user' as const,
          content: `The response did not match the required schema: ${parseError.message}. Fix the JSON and output ONLY the valid JSON.`
        }
      ];

      const retryRes = await this.chatCompletion({
        messages: repairMessages,
        temperature: 0,
        signal: req.signal
      });

      const retryClean = (retryRes.content || '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const retryParsed = JSON.parse(retryClean);
      const validated = req.schema.parse(retryParsed);

      return {
        data: validated,
        rawText: retryClean,
        tokensIn: res.tokensIn + retryRes.tokensIn,
        tokensOut: res.tokensOut + retryRes.tokensOut,
        costUsd: res.costUsd + retryRes.costUsd
      };
    }
  }
}

