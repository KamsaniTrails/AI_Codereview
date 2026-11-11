import type { ParsedSymbol } from './types.js';

export function parseSymbols(filePath: string, content: string): ParsedSymbol[] {
  const isPython = filePath.endsWith('.py');
  if (isPython) {
    return parsePythonSymbols(content);
  }
  return parseJsTsSymbols(content);
}

function parseJsTsSymbols(content: string): ParsedSymbol[] {
  const symbols: ParsedSymbol[] = [];
  const lines = content.split('\n');

  // Match function declarations: async? function name(...)
  // Match class declarations: class Name ...
  // Match arrow functions: const name = async? (...) =>
  // Match method declarations: name(...) {
  const funcRegex = /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/;
  const classRegex = /^(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/;
  const arrowRegex = /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/;
  const methodRegex = /^\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*\{/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    let name = '';
    let kind: ParsedSymbol['kind'] = 'function';
    let signature = '';

    const funcMatch = trimmed.match(funcRegex);
    const classMatch = trimmed.match(classRegex);
    const arrowMatch = trimmed.match(arrowRegex);
    const methodMatch = line.match(methodRegex);

    if (funcMatch) {
      name = funcMatch[1];
      kind = 'function';
      signature = funcMatch[0];
    } else if (classMatch) {
      name = classMatch[1];
      kind = 'class';
      signature = classMatch[0];
    } else if (arrowMatch) {
      name = arrowMatch[1];
      kind = 'function';
      signature = arrowMatch[0];
    } else if (methodMatch && !line.startsWith('//') && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('switch')) {
      name = methodMatch[1];
      kind = 'method';
      signature = methodMatch[0];
    }

    if (name) {
      const startLine = i + 1;
      let endLine = startLine;
      let braceCount = 0;
      let foundStartBrace = false;

      // Scan downwards to find matching closing brace
      for (let j = i; j < lines.length; j++) {
        const curLine = lines[j];
        for (const char of curLine) {
          if (char === '{') {
            braceCount++;
            foundStartBrace = true;
          } else if (char === '}') {
            braceCount--;
          }
        }
        if (foundStartBrace && braceCount <= 0) {
          endLine = j + 1;
          break;
        }
      }

      if (endLine === startLine && lines.length > startLine) {
        endLine = Math.min(startLine + 20, lines.length);
      }

      const bodyLines = lines.slice(startLine - 1, endLine);
      const body = bodyLines.join('\n');
      const calls = extractCallExpressions(body);
      const imports = extractImports(content);

      symbols.push({
        name,
        kind,
        startLine,
        endLine,
        signature,
        body,
        calls,
        imports
      });
    }
  }

  return symbols;
}

function parsePythonSymbols(content: string): ParsedSymbol[] {
  const symbols: ParsedSymbol[] = [];
  const lines = content.split('\n');
  const defRegex = /^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/;
  const classRegex = /^\s*class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let name = '';
    let kind: ParsedSymbol['kind'] = 'function';
    let signature = '';

    const defMatch = line.match(defRegex);
    const classMatch = line.match(classRegex);

    if (defMatch) {
      name = defMatch[1];
      kind = 'function';
      signature = defMatch[0];
    } else if (classMatch) {
      name = classMatch[1];
      kind = 'class';
      signature = classMatch[0];
    }

    if (name) {
      const startLine = i + 1;
      const initialIndent = line.search(/\S/);
      let endLine = startLine;

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (!nextLine.trim()) continue;
        const indent = nextLine.search(/\S/);
        if (indent <= initialIndent) {
          endLine = j;
          break;
        }
        endLine = j + 1;
      }

      const body = lines.slice(startLine - 1, endLine).join('\n');
      symbols.push({
        name,
        kind,
        startLine,
        endLine,
        signature,
        body,
        calls: extractCallExpressions(body),
        imports: extractImports(content)
      });
    }
  }

  return symbols;
}

export function extractCallExpressions(code: string): string[] {
  const calls = new Set<string>();
  const callRegex = /(?:[a-zA-Z0-9_$]+\.)?([a-zA-Z0-9_$]+)\s*\(/g;
  let match: RegExpExecArray | null;

  const reserved = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'function', 'return',
    'require', 'import', 'typeof', 'sizeof', 'console', 'log'
  ]);

  while ((match = callRegex.exec(code)) !== null) {
    const name = match[1];
    if (name && !reserved.has(name) && name.length > 2) {
      calls.add(name);
    }
  }
  return Array.from(calls);
}

export function extractImports(code: string): string[] {
  const imports = new Set<string>();
  const tsImportRegex = /import\s+(?:\{([^}]+)\}|([a-zA-Z0-9_$]+))\s+from/g;
  let match: RegExpExecArray | null;

  while ((match = tsImportRegex.exec(code)) !== null) {
    if (match[1]) {
      match[1].split(',').forEach(item => {
        const clean = item.trim().split(/\s+as\s+/)[0];
        if (clean) imports.add(clean);
      });
    } else if (match[2]) {
      imports.add(match[2].trim());
    }
  }

  const pyImportRegex = /(?:from\s+[a-zA-Z0-9_.]+\s+import\s+([a-zA-Z0-9_,\s]+)|import\s+([a-zA-Z0-9_]+))/g;
  while ((match = pyImportRegex.exec(code)) !== null) {
    if (match[1]) {
      match[1].split(',').forEach(item => {
        const clean = item.trim().split(/\s+as\s+/)[0];
        if (clean) imports.add(clean);
      });
    } else if (match[2]) {
      imports.add(match[2].trim());
    }
  }

  return Array.from(imports);
}

