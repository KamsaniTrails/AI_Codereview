import crypto from 'node:crypto';
import type { Finding } from './types.js';

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[`'"()[\]{}!?:;,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a deterministic fingerprint for a finding.
 * Hash of (normalized file path, category, normalized title, nearest symbol).
 * Persists across commit pushes so identical issues are never re-posted.
 */
export function computeFindingFingerprint(
  finding: Pick<Finding, 'file' | 'category' | 'title'>,
  nearestSymbol?: string
): string {
  const normFile = finding.file.trim().replace(/\\/g, '/').toLowerCase();
  const normCategory = finding.category.toLowerCase().trim();
  const normTitle = normalizeTitle(finding.title);
  const normSymbol = (nearestSymbol || 'root').trim().toLowerCase();

  const payload = `${normFile}:${normCategory}:${normTitle}:${normSymbol}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
