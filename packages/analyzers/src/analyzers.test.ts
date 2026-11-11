import { describe, it, expect } from 'vitest';
import { runBuiltinStaticAnalysis } from './builtinRules.js';
import { StaticAnalyzerRunner } from './runner.js';

describe('packages/analyzers', () => {
  it('detects eval() and hardcoded secrets using static rules', () => {
    const maliciousCode = `
      function runScript(input: string) {
        eval(input);
      }
      const apiKey = "mock_token_1234567890abcdef1234567890";
    `;

    const findings = runBuiltinStaticAnalysis('src/eval.ts', maliciousCode);
    expect(findings.length).toBe(2);
    expect(findings.some(f => f.ruleId === 'security/no-eval')).toBe(true);
    expect(findings.some(f => f.ruleId === 'security/hardcoded-secret')).toBe(true);
  });

  it('runs analysis and normalizes findings into canonical Finding format', async () => {
    const runner = new StaticAnalyzerRunner();
    const fileMap = new Map<string, string>([
      [
        'src/loop.ts',
        `export function testLoop(arr: number[]) {
          for (let i = 0; i <= arr.length; i++) {
            console.log(arr[i]);
          }
        }`
      ]
    ]);

    const findings = await runner.runAnalysis(
      { workingDir: '.', files: ['src/loop.ts'] },
      fileMap
    );

    expect(findings.length).toBeGreaterThan(0);
    const loopFinding = findings.find(f => f.category === 'bug');
    expect(loopFinding).toBeDefined();
    expect(loopFinding?.title).toContain('off-by-one');
    expect(loopFinding?.fingerprint).toBeDefined();
  });
});

