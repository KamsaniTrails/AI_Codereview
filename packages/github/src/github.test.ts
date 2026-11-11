import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from './signature.js';
import { parsePatch, isLineInDiff } from './diff.js';
import { GitHubClient } from './client.js';
import crypto from 'node:crypto';

describe('packages/github', () => {
  it('correctly verifies valid HMAC SHA256 signatures', () => {
    const secret = 'test-webhook-secret';
    const payload = JSON.stringify({ action: 'opened', number: 42 });
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signature = `sha256=${hmac}`;

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('rejects invalid or tampered signatures', () => {
    const secret = 'test-webhook-secret';
    const payload = JSON.stringify({ action: 'opened', number: 42 });
    const wrongSignature = 'sha256=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    expect(verifyWebhookSignature(payload, wrongSignature, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, undefined, secret)).toBe(false);
  });

  it('parses Git diff patch and identifies valid right-side lines', () => {
    const samplePatch = `@@ -10,4 +10,6 @@ function test() {
-  const x = 1;
+  const x = 2;
+  const y = 3;
   return x;
 }`;

    const parsed = parsePatch(samplePatch);
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].newStart).toBe(10);
    // Line 10 was modified to x = 2 (+), Line 11 is y = 3 (+), Line 12 is context line "return x;"
    expect(isLineInDiff(10, parsed.validRightLines)).toBe(true);
    expect(isLineInDiff(11, parsed.validRightLines)).toBe(true);
    expect(isLineInDiff(12, parsed.validRightLines)).toBe(true);
    // Line 99 is not in the patch
    expect(isLineInDiff(99, parsed.validRightLines)).toBe(false);
  });

  it('formats finding comments with badges and suggestions', () => {
    const finding = {
      file: 'auth.ts',
      lineStart: 15,
      lineEnd: 15,
      severity: 'high' as const,
      category: 'security' as const,
      title: 'SQL Injection in raw query',
      message: 'Unsanitized input concatenated into query string.',
      evidence: 'db.query(`SELECT * FROM users WHERE id = ${id}`)',
      suggestion: 'db.query("SELECT * FROM users WHERE id = $1", [id])',
      confidence: 0.95,
      agent: 'security'
    };

    const formatted = GitHubClient.formatFindingComment(finding);
    expect(formatted).toContain('HIGH');
    expect(formatted).toContain('SQL Injection');
    expect(formatted).toContain('```suggestion');
    expect(formatted).toContain('95%');
  });
});

