import {
  FindingsListSchema,
  type Finding,
  type ChangedFile,
  type ContextPack,
  type RepoSettings
} from '@ai-reviewer/core';
import { logger } from '@ai-reviewer/core';
import type { ILlmClient, ChatMessage } from '@ai-reviewer/llm';
import { createLlmClient } from '@ai-reviewer/llm';
import {
  AgentToolDefinitions,
  executeAgentTool,
  type ToolExecutionContext
} from './tools.js';
import {
  BUG_AGENT_PROMPT,
  SECURITY_AGENT_PROMPT,
  QUALITY_AGENT_PROMPT,
  TEST_AGENT_PROMPT,
  SKEPTIC_VERIFIER_PROMPT,
  SUMMARY_GENERATOR_PROMPT
} from './prompts.js';

export interface ReviewGraphInput {
  repoId: string;
  prTitle: string;
  prBody?: string;
  headSha: string;
  changedFiles: ChangedFile[];
  contextPacks: Map<string, ContextPack>;
  staticFindings: Finding[];
  settings: RepoSettings;
  llmClient?: ILlmClient;
  signal?: AbortSignal;
}

export interface ReviewGraphOutput {
  findings: Finding[];
  summary: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export class ReviewGraphRunner {
  private llmClient: ILlmClient;

  constructor(llmClient?: ILlmClient) {
    this.llmClient = llmClient || createLlmClient();
  }

  public async run(input: ReviewGraphInput): Promise<ReviewGraphOutput> {
    logger.info({ prTitle: input.prTitle, filesCount: input.changedFiles.length }, 'Starting multi-agent review graph');

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostUsd = 0;

    // 1. Planner Stage: Decide which agents to activate
    const enabledAgents = new Set(input.settings.enabledAgents || ['bug', 'security', 'quality', 'test']);
    const isDocsOnly = input.changedFiles.every(f => /\.(md|txt|rst|json)$/.test(f.filename));
    if (isDocsOnly) {
      enabledAgents.delete('test');
      enabledAgents.delete('security');
    }

    // Build file contents map for tool access
    const fileContentsMap = new Map<string, string>();
    for (const f of input.changedFiles) {
      if (f.rawContent) {
        fileContentsMap.set(f.filename.replace(/\\/g, '/'), f.rawContent);
      }
    }

    const toolContext: ToolExecutionContext = {
      repoId: input.repoId,
      headSha: input.headSha,
      fileContentsMap,
      prTitle: input.prTitle,
      prBody: input.prBody
    };

    // Prepare diff context payload
    const diffSummary = input.changedFiles.map(f => {
      return `File: ${f.filename}\nPatch:\n${f.patch || 'No patch available'}`;
    }).join('\n\n---\n\n');

    // Context chunks representation
    const contextSnippets: string[] = [];
    for (const [filePath, pack] of input.contextPacks.entries()) {
      if (pack.semanticChunks.length > 0) {
        contextSnippets.push(`Related Context for ${filePath}:\n${pack.semanticChunks.map(c => c.content).join('\n\n')}`);
      }
    }
    const retrievedContextText = contextSnippets.join('\n\n');

    const agentPromises: Promise<Finding[]>[] = [];

    // 2. Parallel Specialist Agent Execution
    if (enabledAgents.has('bug')) {
      agentPromises.push(this.runAgentWithTools('bug', BUG_AGENT_PROMPT, diffSummary, retrievedContextText, input.staticFindings, toolContext, input.signal));
    }
    if (enabledAgents.has('security')) {
      agentPromises.push(this.runAgentWithTools('security', SECURITY_AGENT_PROMPT, diffSummary, retrievedContextText, input.staticFindings, toolContext, input.signal));
    }
    if (enabledAgents.has('quality')) {
      agentPromises.push(this.runAgentWithTools('quality', QUALITY_AGENT_PROMPT, diffSummary, retrievedContextText, input.staticFindings, toolContext, input.signal));
    }
    if (enabledAgents.has('test')) {
      agentPromises.push(this.runAgentWithTools('test', TEST_AGENT_PROMPT, diffSummary, retrievedContextText, input.staticFindings, toolContext, input.signal));
    }

    const agentResults = await Promise.allSettled(agentPromises);
    const aggregatedFindings: Finding[] = [...input.staticFindings];

    for (const res of agentResults) {
      if (res.status === 'fulfilled') {
        aggregatedFindings.push(...res.value);
      } else {
        logger.warn({ err: res.reason?.message }, 'One specialist agent failed; continuing with remaining findings');
      }
    }

    // 3. Skeptic Verifier Pass on High-Severity Findings
    const highSeverityFindings = aggregatedFindings.filter(f => f.severity === 'critical' || f.severity === 'high');
    const otherFindings = aggregatedFindings.filter(f => f.severity !== 'critical' && f.severity !== 'high');

    const verifiedHighSeverity = await this.runSkepticVerifier(highSeverityFindings, diffSummary, input.signal);
    const finalFindings = [...verifiedHighSeverity, ...otherFindings];

    // 4. PR Review Summary Generation
    const summary = await this.generatePrSummary(input.prTitle, input.changedFiles, finalFindings, input.signal);

    return {
      findings: finalFindings,
      summary,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd: totalCostUsd
    };
  }

  private async runAgentWithTools(
    agentName: string,
    systemPrompt: string,
    diffText: string,
    contextText: string,
    staticFindings: Finding[],
    toolContext: ToolExecutionContext,
    signal?: AbortSignal
  ): Promise<Finding[]> {
    logger.debug({ agent: agentName }, 'Running specialist agent');

    const staticEvidence = staticFindings.length > 0
      ? `Static Analysis Pre-check Findings:\n${JSON.stringify(staticFindings, null, 2)}`
      : 'No static analysis warnings reported.';

    const userPrompt = `
PR Title: ${toolContext.prTitle}
Description: ${toolContext.prBody || 'N/A'}

${staticEvidence}

Retrieved Codebase Context:
${contextText || 'No extra context found.'}

Diff to review:
${diffText}

Instructions:
Review the diff thoroughly for ${agentName} issues.
You can use tools to inspect callers, definitions, or other files if needed.
Output a JSON array of findings matching the Finding schema.
`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Tool calling loop (max 4 tool iterations)
    let maxToolLoops = 4;
    while (maxToolLoops > 0) {
      if (signal?.aborted) throw new Error('Review cancelled');

      const response = await this.llmClient.chatCompletion({
        messages,
        tools: AgentToolDefinitions,
        temperature: 0,
        signal
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        break; // No further tools requested
      }

      for (const call of response.toolCalls) {
        const toolResult = await executeAgentTool(call.function.name, call.function.arguments, toolContext);
        messages.push({
          role: 'assistant',
          content: '',
          toolCalls: [call]
        });
        messages.push({
          role: 'tool',
          name: call.function.name,
          toolCallId: call.id,
          content: toolResult
        });
      }

      maxToolLoops--;
    }

    // Now request structured output matching FindingsListSchema
    try {
      const structuredRes = await this.llmClient.generateStructuredOutput({
        messages,
        schema: FindingsListSchema,
        temperature: 0,
        signal
      });

      return structuredRes.data.map(f => ({ ...f, agent: agentName }));
    } catch (err: any) {
      logger.warn({ agent: agentName, err: err.message }, 'Agent structured output parsing failed');
      return [];
    }
  }

  private async runSkepticVerifier(
    candidates: Finding[],
    diffText: string,
    signal?: AbortSignal
  ): Promise<Finding[]> {
    if (candidates.length === 0) return [];

    const prompt = `
Verify the following high-severity code review findings against the pull request diff:
Findings to verify:
${JSON.stringify(candidates, null, 2)}

Diff:
${diffText}

Return ONLY the verified findings array that are fully supported by the diff. Discard false alarms.
`;

    try {
      const res = await this.llmClient.generateStructuredOutput({
        messages: [
          { role: 'system', content: SKEPTIC_VERIFIER_PROMPT },
          { role: 'user', content: prompt }
        ],
        schema: FindingsListSchema,
        temperature: 0,
        signal
      });
      return res.data;
    } catch {
      // If verifier call fails, fall back to keeping original candidates
      return candidates;
    }
  }

  private async generatePrSummary(
    prTitle: string,
    changedFiles: ChangedFile[],
    findings: Finding[],
    signal?: AbortSignal
  ): Promise<string> {
    const counts = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length
    };

    const prompt = `
PR Title: ${prTitle}
Changed Files: ${changedFiles.map(f => `${f.filename} (+${f.additions}/-${f.deletions})`).join(', ')}
Severity Counts: Critical: ${counts.critical}, High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low}

Findings summary list:
${findings.map(f => `- [${f.severity.toUpperCase()}] ${f.file}:${f.lineStart} - ${f.title}`).join('\n')}

Generate an executive review summary with markdown table and recommendations.
`;

    try {
      const res = await this.llmClient.chatCompletion({
        messages: [
          { role: 'system', content: SUMMARY_GENERATOR_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        signal
      });
      return res.content || this.generateFallbackSummary(prTitle, counts, changedFiles);
    } catch {
      return this.generateFallbackSummary(prTitle, counts, changedFiles);
    }
  }

  private generateFallbackSummary(
    prTitle: string,
    counts: Record<string, number>,
    changedFiles: ChangedFile[]
  ): string {
    return `## AI Code Review: ${prTitle}

### Summary of Findings
| Severity | Count |
| :--- | :--- |
| 🔴 Critical | **${counts.critical}** |
| 🟠 High | **${counts.high}** |
| 🟡 Medium | **${counts.medium}** |
| 🔵 Low | **${counts.low}** |

**Files Reviewed:** ${changedFiles.length} file(s).
*Analysis conducted by automated specialist agents with RAG context and static security pre-checks.*
`;
  }
}

export const reviewGraphRunner = new ReviewGraphRunner();

