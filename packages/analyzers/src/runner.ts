import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Finding } from '@ai-reviewer/core';
import { logger } from '@ai-reviewer/core';
import type { RawStaticFinding, AnalyzerRunOptions } from './types.js';
import { runBuiltinStaticAnalysis } from './builtinRules.js';
import { normalizeStaticFinding } from './normalizer.js';

const execAsync = promisify(exec);

export class StaticAnalyzerRunner {
  /**
   * Runs all available static analysis tools across changed files.
   * If any external CLI tool is missing or fails, the pipeline safely continues.
   */
  public async runAnalysis(
    options: AnalyzerRunOptions,
    fileContentsMap?: Map<string, string>
  ): Promise<Finding[]> {
    const rawFindings: RawStaticFinding[] = [];

    // 1. Run Built-in fast AST / pattern analysis on provided file contents
    if (fileContentsMap) {
      for (const [filePath, content] of fileContentsMap.entries()) {
        try {
          const builtin = runBuiltinStaticAnalysis(filePath, content);
          rawFindings.push(...builtin);
        } catch (err: any) {
          logger.warn({ err: err.message, filePath }, 'Built-in static analysis error');
        }
      }
    } else {
      // Read files from disk
      for (const relPath of options.files) {
        try {
          const fullPath = path.join(options.workingDir, relPath);
          const content = await fs.readFile(fullPath, 'utf-8');
          const builtin = runBuiltinStaticAnalysis(relPath, content);
          rawFindings.push(...builtin);
        } catch {
          // File may have been deleted or inaccessible
        }
      }
    }

    // 2. Run external Semgrep if installed and not aborted
    if (!options.signal?.aborted) {
      try {
        const semgrepFindings = await this.runSemgrep(options);
        rawFindings.push(...semgrepFindings);
      } catch (err: any) {
        logger.debug({ err: err.message }, 'Semgrep execution skipped or unavailable');
      }
    }

    // 3. Normalize all raw findings to canonical Finding type
    return rawFindings.map(normalizeStaticFinding);
  }

  private async runSemgrep(options: AnalyzerRunOptions): Promise<RawStaticFinding[]> {
    const filesToScan = options.files.filter(f => /\.(ts|js|py)$/.test(f));
    if (filesToScan.length === 0) return [];

    try {
      // Run semgrep with r2c-security-audit ruleset in JSON format with timeout
      const cmd = `semgrep --config "p/security-audit" --json --quiet ${filesToScan.join(' ')}`;
      const { stdout } = await execAsync(cmd, {
        cwd: options.workingDir,
        timeout: 15000
      });

      const parsed = JSON.parse(stdout);
      const results: RawStaticFinding[] = [];

      for (const item of (parsed.results || [])) {
        const severityMap: Record<string, RawStaticFinding['severity']> = {
          ERROR: 'high',
          WARNING: 'medium',
          INFO: 'low'
        };

        results.push({
          tool: 'semgrep',
          ruleId: item.check_id || 'semgrep-rule',
          file: path.relative(options.workingDir, item.path),
          lineStart: item.start?.line || 1,
          lineEnd: item.end?.line || item.start?.line || 1,
          message: item.extra?.message || 'Semgrep finding',
          severity: severityMap[item.extra?.severity] || 'medium',
          category: 'security',
          codeSnippet: item.extra?.lines
        });
      }

      return results;
    } catch {
      return [];
    }
  }
}

export const staticAnalyzerRunner = new StaticAnalyzerRunner();

