import type { Finding, RepoSettings, ChangedFile } from '@ai-reviewer/core';
import { computeFindingFingerprint } from '@ai-reviewer/core';
import { isLineInDiff } from '@ai-reviewer/github';

export interface PostProcessOptions {
  settings: RepoSettings;
  changedFiles: ChangedFile[];
  unhelpfulFingerprints?: Set<string>;
  staticFindings?: Finding[];
}

export interface PostProcessResult {
  inlineFindings: Finding[];
  summaryOnlyFindings: Finding[];
  allValidFindings: Finding[];
  suppressedCount: number;
}

const SEVERITY_WEIGHTS: Record<Finding['severity'], number> = {
  critical: 1.0,
  high: 0.8,
  medium: 0.5,
  low: 0.3,
  info: 0.1
};

export function postProcessFindings(
  rawFindings: Finding[],
  options: PostProcessOptions
): PostProcessResult {
  const { settings, changedFiles, unhelpfulFingerprints = new Set(), staticFindings = [] } = options;

  // Map each file to its set of valid diff lines
  const fileDiffLinesMap = new Map<string, Set<number>>();
  for (const f of changedFiles) {
    fileDiffLinesMap.set(f.filename.replace(/\\/g, '/'), f.validDiffLines);
  }

  // 1. Ensure fingerprints are computed
  const withFingerprints = rawFindings.map(f => {
    const fp = f.fingerprint || computeFindingFingerprint(f);
    return { ...f, fingerprint: fp };
  });

  // 2. Boost confidence if finding was also identified by static analyzers
  const staticFpSet = new Set(staticFindings.map(s => s.fingerprint || computeFindingFingerprint(s)));
  for (const f of withFingerprints) {
    if (f.fingerprint && staticFpSet.has(f.fingerprint)) {
      f.confidence = Math.min(0.99, f.confidence + 0.10);
      f.message += ' (Confirmed by static analysis)';
    }
  }

  // 3. Deduplicate overlapping findings in same file & category
  const dedupedMap = new Map<string, Finding>();
  for (const f of withFingerprints) {
    const normFile = f.file.replace(/\\/g, '/');
    const key = `${normFile}:${f.category}:${Math.floor(f.lineStart / 3)}`;
    const existing = dedupedMap.get(key);

    if (!existing) {
      dedupedMap.set(key, { ...f, file: normFile });
    } else {
      // Keep higher confidence finding and merge evidence
      if (f.confidence > existing.confidence) {
        existing.confidence = f.confidence;
        existing.title = f.title;
        existing.message = f.message;
        existing.suggestion = f.suggestion || existing.suggestion;
      }
      existing.evidence = `${existing.evidence} | ${f.evidence}`;
    }
  }

  let candidates = Array.from(dedupedMap.values());
  let suppressedCount = 0;

  // 4. Filter by confidence threshold & user unhelpful feedback
  const threshold = settings.confidenceThreshold ?? 0.60;
  candidates = candidates.filter(f => {
    // Drop if marked unhelpful previously in this repo
    if (f.fingerprint && unhelpfulFingerprints.has(f.fingerprint)) {
      suppressedCount++;
      return false;
    }
    // Drop if confidence below threshold
    if (f.confidence < threshold) {
      suppressedCount++;
      return false;
    }
    return true;
  });

  // 5. Filter line numbers against active PR diff lines
  const validDiffFindings: Finding[] = [];
  const outOfDiffFindings: Finding[] = [];

  for (const f of candidates) {
    const validLines = fileDiffLinesMap.get(f.file);
    if (!validLines) {
      outOfDiffFindings.push(f);
      continue;
    }

    // Check if lineStart or any line in range is inside diff
    let hasLineInDiff = false;
    for (let l = f.lineStart; l <= f.lineEnd; l++) {
      if (isLineInDiff(l, validLines)) {
        hasLineInDiff = true;
        break;
      }
    }

    if (hasLineInDiff) {
      validDiffFindings.push(f);
    } else {
      outOfDiffFindings.push(f);
    }
  }

  // 6. Rank findings by severity weight * confidence
  validDiffFindings.sort((a, b) => {
    const scoreA = (SEVERITY_WEIGHTS[a.severity] || 0.5) * a.confidence;
    const scoreB = (SEVERITY_WEIGHTS[b.severity] || 0.5) * b.confidence;
    return scoreB - scoreA;
  });

  // 7. Cap inline comments at maxComments (default 10). Critical findings are ALWAYS shown.
  const maxComments = settings.maxComments ?? 10;
  const inlineFindings: Finding[] = [];
  const summaryOnlyFindings: Finding[] = [...outOfDiffFindings];

  for (const f of validDiffFindings) {
    if (f.severity === 'critical' || inlineFindings.length < maxComments) {
      inlineFindings.push(f);
    } else {
      summaryOnlyFindings.push(f);
    }
  }

  return {
    inlineFindings,
    summaryOnlyFindings,
    allValidFindings: [...inlineFindings, ...summaryOnlyFindings],
    suppressedCount
  };
}

