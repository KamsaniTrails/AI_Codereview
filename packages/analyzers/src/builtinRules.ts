import type { RawStaticFinding } from './types.js';

interface StaticRule {
  id: string;
  category: RawStaticFinding['category'];
  severity: RawStaticFinding['severity'];
  message: string;
  check: (line: string, lineNum: number, fullText: string) => boolean;
}

const STATIC_RULES: StaticRule[] = [
  {
    id: 'security/no-eval',
    category: 'security',
    severity: 'critical',
    message: 'The use of eval() allows arbitrary script execution and leads to remote code execution.',
    check: (line) => /\beval\s*\(/.test(line) && !line.includes('//')
  },
  {
    id: 'security/hardcoded-secret',
    category: 'security',
    severity: 'critical',
    message: 'Potential secret key or token hardcoded in source code. Use environment variables.',
    check: (line) => /(api_?[kK]ey|secret|bearer_?token|jwt_?secret|token|key)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/i.test(line)
  },
  {
    id: 'security/sql-injection-risk',
    category: 'security',
    severity: 'high',
    message: 'Raw SQL query created via string interpolation or concatenation. Use parameterized queries.',
    check: (line) => /(?:query|execute)\s*\(\s*`\s*(?:SELECT|INSERT|UPDATE|DELETE).*\$\{/i.test(line)
  },
  {
    id: 'security/insecure-random',
    category: 'security',
    severity: 'medium',
    message: 'Math.random() is cryptographically weak. Use crypto.randomUUID() or crypto.getRandomValues().',
    check: (line) => /Math\.random\(\)/.test(line) && /(token|nonce|salt|secret|key|id)/i.test(line)
  },
  {
    id: 'bug/off-by-one-loop',
    category: 'bug',
    severity: 'medium',
    message: 'Potential off-by-one boundary error. Using <= on array.length causes out-of-bounds index access.',
    check: (line) => /for\s*\([^;]+;\s*[a-zA-Z0-9_]+\s*<=\s*[a-zA-Z0-9_]+\.length/.test(line)
  },
  {
    id: 'bug/floating-promise-missing-await',
    category: 'bug',
    severity: 'high',
    message: 'Asynchronous fetch or database call invoked without await in an async context.',
    check: (line) => /^\s+(?:const\s+\w+\s*=\s*)?fetch\(/.test(line) && !line.includes('await fetch')
  },
  {
    id: 'quality/no-console-log',
    category: 'quality',
    severity: 'low',
    message: 'Avoid leaving debug console.log statements in production code. Use structured logger.',
    check: (line) => /console\.log\(/.test(line) && !line.trim().startsWith('//')
  }
];

export function runBuiltinStaticAnalysis(filePath: string, content: string): RawStaticFinding[] {
  const findings: RawStaticFinding[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    for (const rule of STATIC_RULES) {
      if (rule.check(line, lineNum, content)) {
        findings.push({
          tool: 'builtin-ast',
          ruleId: rule.id,
          file: filePath,
          lineStart: lineNum,
          lineEnd: lineNum,
          message: rule.message,
          severity: rule.severity,
          category: rule.category,
          codeSnippet: line.trim()
        });
      }
    }
  }

  return findings;
}
