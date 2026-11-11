export interface ParsedSymbol {
  name: string;
  kind: 'function' | 'method' | 'class' | 'interface' | 'variable' | 'file';
  startLine: number;
  endLine: number;
  signature?: string;
  docstring?: string;
  body: string;
  calls: string[];
  imports: string[];
}

export interface ChunkOptions {
  maxLines?: number; // default 60 lines
  overlapLines?: number; // default 15 lines
}

