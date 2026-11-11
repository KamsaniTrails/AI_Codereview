import type { Finding } from '@ai-reviewer/core';
import { computeFindingFingerprint } from '@ai-reviewer/core';
import type { RawStaticFinding } from './types.js';

export function normalizeStaticFinding(raw: RawStaticFinding): Finding {
  const confidence = raw.severity === 'critical' ? 0.95 : raw.severity === 'high' ? 0.88 : 0.80;

  const candidate: Finding = {
    agent: `static:${raw.tool}`,
    file: raw.file.replace(/\\/g, '/'),
    lineStart: raw.lineStart,
    lineEnd: raw.lineEnd,
    severity: raw.severity,
    category: raw.category,
    title: `[${raw.tool.toUpperCase()}] ${raw.ruleId}`,
    message: raw.message,
    evidence: raw.codeSnippet || `Triggered rule ${raw.ruleId} at lines ${raw.lineStart}-${raw.lineEnd}`,
    confidence,
    status: 'posted'
  };

  candidate.fingerprint = computeFindingFingerprint(candidate);
  return candidate;
}

