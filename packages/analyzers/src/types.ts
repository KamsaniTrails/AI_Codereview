import type { Severity, Category } from '@ai-reviewer/core';

export interface RawStaticFinding {
  tool: 'eslint' | 'semgrep' | 'bandit' | 'ruff' | 'builtin-ast';
  ruleId: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  message: string;
  severity: Severity;
  category: Category;
  codeSnippet?: string;
}

export interface AnalyzerRunOptions {
  workingDir: string;
  files: string[];
  signal?: AbortSignal;
}

