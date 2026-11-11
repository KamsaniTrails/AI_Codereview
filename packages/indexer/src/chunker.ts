import crypto from 'node:crypto';
import type { CodeChunk } from '@ai-reviewer/core';
import { parseSymbols } from './parser.js';
import type { ChunkOptions } from './types.js';

export function chunkFile(
  repoId: string,
  filePath: string,
  content: string,
  commitSha: string,
  options?: ChunkOptions
): { chunks: CodeChunk[]; symbolCallsMap: Map<string, string[]> } {
  const maxLines = options?.maxLines || 60;
  const overlapLines = options?.overlapLines || 15;
  const chunks: CodeChunk[] = [];
  const symbolCallsMap = new Map<string, string[]>();

  const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
  const isJs = filePath.endsWith('.js') || filePath.endsWith('.jsx');
  const isPy = filePath.endsWith('.py');
  const language = isTs ? 'typescript' : isJs ? 'javascript' : isPy ? 'python' : 'other';

  const symbols = parseSymbols(filePath, content);
  const fileLines = content.split('\n');

  if (symbols.length === 0) {
    // File with no symbols: split with sliding windows of maxLines
    for (let i = 0; i < fileLines.length; i += (maxLines - overlapLines)) {
      const startLine = i + 1;
      const endLine = Math.min(i + maxLines, fileLines.length);
      const chunkBody = fileLines.slice(i, endLine).join('\n');
      const hash = crypto.createHash('sha256').update(chunkBody).digest('hex');
      const formatted = `File: ${filePath}\nSymbol: <root>\n\n${chunkBody}`;

      chunks.push({
        id: crypto.randomUUID(),
        repoId,
        filePath,
        symbolName: '<root>',
        symbolKind: 'file',
        language,
        startLine,
        endLine,
        content: formatted,
        contentHash: hash,
        commitSha
      });

      if (endLine >= fileLines.length) break;
    }
    return { chunks, symbolCallsMap };
  }

  for (const sym of symbols) {
    const symLines = sym.body.split('\n');
    symbolCallsMap.set(sym.name, sym.calls);

    if (symLines.length <= maxLines) {
      const hash = crypto.createHash('sha256').update(sym.body).digest('hex');
      const formatted = `File: ${filePath}\nSymbol: ${sym.name}\n\n${sym.body}`;

      chunks.push({
        id: crypto.randomUUID(),
        repoId,
        filePath,
        symbolName: sym.name,
        symbolKind: sym.kind,
        language,
        startLine: sym.startLine,
        endLine: sym.endLine,
        content: formatted,
        contentHash: hash,
        commitSha
      });
    } else {
      // Symbol longer than maxLines: split into overlapping sliding windows
      for (let j = 0; j < symLines.length; j += (maxLines - overlapLines)) {
        const startOffset = j;
        const endOffset = Math.min(j + maxLines, symLines.length);
        const subBody = symLines.slice(startOffset, endOffset).join('\n');
        const hash = crypto.createHash('sha256').update(subBody).digest('hex');
        const formatted = `File: ${filePath}\nSymbol: ${sym.name} (part ${Math.floor(j / maxLines) + 1})\n\n${subBody}`;

        chunks.push({
          id: crypto.randomUUID(),
          repoId,
          filePath,
          symbolName: sym.name,
          symbolKind: sym.kind,
          language,
          startLine: sym.startLine + startOffset,
          endLine: sym.startLine + endOffset - 1,
          content: formatted,
          contentHash: hash,
          commitSha
        });

        if (endOffset >= symLines.length) break;
      }
    }
  }

  return { chunks, symbolCallsMap };
}

