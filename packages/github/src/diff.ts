import type { DiffHunk } from '@ai-reviewer/core';

export interface ParsedPatch {
  hunks: DiffHunk[];
  validRightLines: Set<number>;
  addedLines: Set<number>;
}

/**
 * Parses a GitHub Git unified diff patch string.
 * Maps hunk boundaries and identifies all valid right-side (new file) line numbers
 * where GitHub allows inline comments.
 */
export function parsePatch(patch?: string): ParsedPatch {
  const hunks: DiffHunk[] = [];
  const validRightLines = new Set<number>();
  const addedLines = new Set<number>();

  if (!patch) {
    return { hunks, validRightLines, addedLines };
  }

  const lines = patch.split('\n');
  let currentHunk: DiffHunk | null = null;
  let currentNewLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const oldStart = parseInt(match[1], 10);
        const oldLines = match[2] ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10);
        const newLines = match[4] ? parseInt(match[4], 10) : 1;

        currentHunk = {
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: [line]
        };
        hunks.push(currentHunk);
        currentNewLine = newStart;
      }
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    currentHunk.lines.push(line);

    if (line.startsWith('+')) {
      validRightLines.add(currentNewLine);
      addedLines.add(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith(' ')) {
      // Context lines on the right side are also in the diff and can receive comments
      validRightLines.add(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith('-')) {
      // Deleted line exists only on old side
    }
  }

  return {
    hunks,
    validRightLines,
    addedLines
  };
}

/**
 * Checks whether a given target line number falls on an active line in the PR diff.
 */
export function isLineInDiff(line: number, validLines: Set<number>): boolean {
  return validLines.has(line);
}

