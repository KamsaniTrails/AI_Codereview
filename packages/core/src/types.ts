export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Category = 'bug' | 'security' | 'quality' | 'test';

export type FindingStatus = 'posted' | 'suppressed' | 'duplicate';

export interface Finding {
  id?: string;
  reviewId?: string;
  agent: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  evidence: string;
  suggestion?: string;
  confidence: number;
  fingerprint?: string;
  status?: FindingStatus;
  githubCommentId?: string;
}

export type ReviewStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface Review {
  id: string;
  repoId: string;
  prNumber: number;
  headSha: string;
  status: ReviewStatus;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  model: string;
  promptVersion: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  error?: string | null;
  summary?: string | null;
}

export interface RepoSettings {
  confidenceThreshold: number; // default 0.60
  enabledAgents: ('bug' | 'security' | 'quality' | 'test')[];
  ignoreGlobs: string[]; // e.g. ["**/*.min.js", "**/dist/**", "**/vendor/**"]
  maxComments: number; // default 10
  reviewDrafts: boolean; // default false
  maxFileSizeKb: number; // default 200
  languageOverrides?: Record<string, string>;
}

export type IndexStatus = 'PENDING' | 'INDEXING' | 'INDEXED' | 'FAILED' | 'pending' | 'indexing' | 'indexed' | 'failed';

export interface Repo {
  id: string;
  installationId: number;
  githubRepoId: number;
  fullName: string; // "owner/repo"
  defaultBranch: string;
  lastIndexedSha?: string | null;
  indexStatus: IndexStatus;
  indexError?: string | null;
  activeAgents?: string[];
  settings: RepoSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Installation {
  id: number; // GitHub installation ID
  accountLogin: string;
  accountType: 'User' | 'Organization';
  suspendedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CodeChunk {
  id: string;
  repoId: string;
  filePath: string;
  symbolName: string;
  symbolKind: 'function' | 'method' | 'class' | 'interface' | 'variable' | 'file';
  language: 'typescript' | 'javascript' | 'python' | 'other';
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  commitSha: string;
  embedding?: number[];
  tsv?: string;
}

export interface SymbolEdge {
  id?: string;
  repoId: string;
  fromChunkId: string;
  toSymbolName: string;
  kind: 'calls' | 'imports';
}

export interface ContextPack {
  changedSymbol?: CodeChunk;
  callers: CodeChunk[];
  callees: CodeChunk[];
  semanticChunks: CodeChunk[];
  keywordChunks: CodeChunk[];
  testChunks: CodeChunk[];
  conventions?: string;
}

export interface ReviewJobPayload {
  installationId: number;
  repoId: string;
  repoFullName: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  deliveryId: string;
}

export interface IndexJobPayload {
  installationId: number;
  repoId: string;
  repoFullName: string;
  commitSha: string;
  defaultBranch: string;
  isIncremental: boolean;
  lastIndexedSha?: string;
}

export interface Feedback {
  id?: string;
  findingId: string;
  userLogin: string;
  value: 1 | -1; // +1 helpful, -1 not helpful
  reason?: string;
  createdAt?: Date;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface ChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  rawContent?: string;
  validDiffLines: Set<number>;
}

export interface EvalCase {
  id: string;
  title: string;
  type: 'real_bug' | 'injected_bug' | 'clean_pr';
  language: 'typescript' | 'javascript' | 'python';
  repo: string;
  baseCommit: string;
  headCommit: string;
  diff: string;
  files: { path: string; content: string }[];
  expectedFindings: {
    file: string;
    lineRange: [number, number];
    category: Category;
    severity?: Severity;
    description: string;
  }[];
}

export interface EvalRunMetrics {
  precision: number;
  recall: number;
  falsePositiveRate: number;
  locationAccuracy: number;
  noise: number; // average comments per PR
  avgTokensIn: number;
  avgTokensOut: number;
  avgCostUsd: number;
  avgLatencyMs: number;
  retrievalHitRate: number;
}

