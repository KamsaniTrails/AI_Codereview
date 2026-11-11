import { z } from 'zod';
import type { ToolDefinition } from '@ai-reviewer/llm';
import { dbService } from '@ai-reviewer/db';
import { createEmbeddingClient } from '@ai-reviewer/llm';
import { staticAnalyzerRunner } from '@ai-reviewer/analyzers';

export interface ToolExecutionContext {
  repoId: string;
  headSha: string;
  fileContentsMap: Map<string, string>;
  prTitle: string;
  prBody?: string;
}

export const AgentToolDefinitions: ToolDefinition[] = [
  {
    name: 'search_codebase',
    description: 'Semantic and keyword search over indexed code chunks in the repository',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or natural language query' },
        k: { type: 'number', description: 'Number of results to return (max 8)' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read file contents at the current head commit, with optional line range',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        startLine: { type: 'number', description: 'Starting line number (1-indexed)' },
        endLine: { type: 'number', description: 'Ending line number (inclusive)' }
      },
      required: ['path']
    }
  },
  {
    name: 'get_symbol',
    description: 'Find definition and source code for a function, method, or class',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name' }
      },
      required: ['name']
    }
  },
  {
    name: 'find_callers',
    description: 'Find functions or methods that call the specified symbol',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'find_callees',
    description: 'Find functions or methods called by the specified symbol',
    parameters: {
      type: 'object',
      properties: {
        chunkId: { type: 'string', description: 'Chunk ID of the caller' }
      },
      required: ['chunkId']
    }
  },
  {
    name: 'list_tests_for',
    description: 'Find test files and chunks referencing the specified file path',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to find tests for' }
      },
      required: ['path']
    }
  },
  {
    name: 'run_linter',
    description: 'Execute normalized static analysis rules on a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to analyze' }
      },
      required: ['path']
    }
  },
  {
    name: 'get_pr_context',
    description: 'Retrieve PR metadata including title, description, and intent',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];

export async function executeAgentTool(
  toolName: string,
  rawArgs: string,
  context: ToolExecutionContext
): Promise<string> {
  let args: any = {};
  try {
    args = JSON.parse(rawArgs);
  } catch {
    args = {};
  }

  switch (toolName) {
    case 'search_codebase': {
      const q = String(args.query || '');
      const k = Math.min(Number(args.k || 5), 8);
      const embeddingClient = createEmbeddingClient();
      const vec = await embeddingClient.getEmbedding(q);
      const results = await dbService.searchSimilarChunks(context.repoId, vec, k);
      return JSON.stringify(results.map(r => ({
        file: r.filePath,
        symbol: r.symbolName,
        lines: `${r.startLine}-${r.endLine}`,
        content: r.content
      })));
    }

    case 'read_file': {
      const p = String(args.path || '').replace(/\\/g, '/');
      const content = context.fileContentsMap.get(p);
      if (!content) {
        return `File not found: ${p}`;
      }
      const lines = content.split('\n');
      const start = Math.max(1, Number(args.startLine || 1));
      const end = Math.min(lines.length, Number(args.endLine || lines.length));
      return lines.slice(start - 1, end).map((l, idx) => `${start + idx}: ${l}`).join('\n');
    }

    case 'get_symbol': {
      const name = String(args.name || '');
      const results = await dbService.searchKeywordChunks(context.repoId, name, 3);
      const match = results.find(c => c.symbolName === name) || results[0];
      if (!match) return `Symbol "${name}" not found.`;
      return `Symbol: ${match.symbolName} in ${match.filePath} (${match.startLine}-${match.endLine})\n${match.content}`;
    }

    case 'find_callers': {
      const sym = String(args.symbol || '');
      const callers = await dbService.findCallers(context.repoId, sym, 5);
      return JSON.stringify(callers.map(c => ({
        caller: c.symbolName,
        file: c.filePath,
        lines: `${c.startLine}-${c.endLine}`
      })));
    }

    case 'find_callees': {
      const chunkId = String(args.chunkId || '');
      const callees = await dbService.findCallees(context.repoId, chunkId, 5);
      return JSON.stringify(callees.map(c => ({
        callee: c.symbolName,
        file: c.filePath
      })));
    }

    case 'list_tests_for': {
      const p = String(args.path || '');
      const base = p.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
      const testChunks = await dbService.searchKeywordChunks(context.repoId, `${base} test`, 5);
      return JSON.stringify(testChunks.map(t => ({
        testFile: t.filePath,
        symbol: t.symbolName
      })));
    }

    case 'run_linter': {
      const p = String(args.path || '').replace(/\\/g, '/');
      const content = context.fileContentsMap.get(p) || '';
      const findings = await staticAnalyzerRunner.runAnalysis(
        { workingDir: '.', files: [p] },
        new Map([[p, content]])
      );
      return JSON.stringify(findings);
    }

    case 'get_pr_context': {
      return JSON.stringify({
        title: context.prTitle,
        description: context.prBody || 'No description provided.'
      });
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

