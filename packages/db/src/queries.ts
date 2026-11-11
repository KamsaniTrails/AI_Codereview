import { getDb, getDbPool } from './client.js';
import * as schema from './schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import type {
  Installation,
  Repo,
  RepoSettings,
  Review,
  Finding,
  Feedback,
  CodeChunk,
  SymbolEdge,
  EvalRunMetrics
} from '@ai-reviewer/core';
import { logger } from '@ai-reviewer/core';

// In-Memory store fallback for offline tests or when PG is unavailable
class InMemoryStore {
  installations = new Map<number, Installation>();
  repos = new Map<string, Repo>();
  deliveries = new Set<string>();
  reviews = new Map<string, Review>();
  findings = new Map<string, Finding>();
  feedback = new Map<string, Feedback>();
  chunks = new Map<string, CodeChunk>();
  fileIndexes = new Map<string, { filePath: string; fileHash: string; indexedSha: string }>();
  edges: SymbolEdge[] = [];
  evalRuns: any[] = [];
}

const memoryStore = new InMemoryStore();

export class DatabaseService {
  private isConnectedToPg = false;

  constructor() {
    // Check if PG pool is active
    getDbPool()
      .query('SELECT 1')
      .then(() => {
        this.isConnectedToPg = true;
      })
      .catch(() => {
        this.isConnectedToPg = false;
      });
  }

  // --- Installations & Repos ---
  public async upsertInstallation(inst: { id: number; accountLogin: string; accountType: string; suspendedAt?: Date | null }): Promise<void> {
    if (this.isConnectedToPg) {
      const db = getDb();
      await db.insert(schema.installations)
        .values({
          id: inst.id,
          accountLogin: inst.accountLogin,
          accountType: inst.accountType,
          suspendedAt: inst.suspendedAt,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: schema.installations.id,
          set: {
            accountLogin: inst.accountLogin,
            suspendedAt: inst.suspendedAt,
            updatedAt: new Date()
          }
        });
      return;
    }

    memoryStore.installations.set(inst.id, {
      id: inst.id,
      accountLogin: inst.accountLogin,
      accountType: inst.accountType as any,
      suspendedAt: inst.suspendedAt
    });
  }

  public async getInstallation(id: number): Promise<Installation | null> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.installations).where(eq(schema.installations.id, id));
      return (rows[0] as unknown as Installation) || null;
    }
    return memoryStore.installations.get(id) || null;
  }

  public async deleteInstallation(id: number): Promise<void> {
    if (this.isConnectedToPg) {
      const db = getDb();
      await db.delete(schema.installations).where(eq(schema.installations.id, id));
      return;
    }
    memoryStore.installations.delete(id);
    for (const [repoId, repo] of memoryStore.repos.entries()) {
      if (repo.installationId === id) {
        memoryStore.repos.delete(repoId);
      }
    }
  }

  public async upsertRepo(data: {
    installationId: number;
    githubRepoId: number;
    fullName: string;
    defaultBranch?: string;
    indexStatus?: 'PENDING' | 'INDEXING' | 'INDEXED' | 'FAILED';
    indexError?: string | null;
    lastIndexedSha?: string | null;
    activeAgents?: string[];
    settings?: Partial<RepoSettings>;
  }): Promise<Repo> {
    const defaultSettings: RepoSettings = {
      confidenceThreshold: 0.60,
      enabledAgents: ['bug', 'security', 'quality', 'test'],
      ignoreGlobs: ['**/node_modules/**', '**/dist/**', '**/*.min.js', '**/package-lock.json'],
      maxComments: 10,
      reviewDrafts: false,
      maxFileSizeKb: 200,
      ...data.settings
    };

    const initialStatus = data.indexStatus || 'PENDING';
    const agents = data.activeAgents || ['bug', 'security', 'quality', 'test'];

    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.insert(schema.repos)
        .values({
          installationId: data.installationId,
          githubRepoId: data.githubRepoId,
          fullName: data.fullName,
          defaultBranch: data.defaultBranch || 'main',
          indexStatus: initialStatus,
          indexError: data.indexError || null,
          lastIndexedSha: data.lastIndexedSha || null,
          activeAgents: agents,
          settings: defaultSettings,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: schema.repos.githubRepoId,
          set: {
            fullName: data.fullName,
            defaultBranch: data.defaultBranch || 'main',
            updatedAt: new Date()
          }
        })
        .returning();

      return rows[0] as unknown as Repo;
    }

    let existingRepo: Repo | undefined;
    for (const r of memoryStore.repos.values()) {
      if (r.githubRepoId === data.githubRepoId) {
        existingRepo = r;
        break;
      }
    }

    if (existingRepo) {
      existingRepo.fullName = data.fullName;
      if (data.defaultBranch) existingRepo.defaultBranch = data.defaultBranch;
      if (data.settings) existingRepo.settings = { ...existingRepo.settings, ...data.settings };
      existingRepo.updatedAt = new Date();
      return existingRepo;
    }

    const newRepo: Repo = {
      id: crypto.randomUUID(),
      installationId: data.installationId,
      githubRepoId: data.githubRepoId,
      fullName: data.fullName,
      defaultBranch: data.defaultBranch || 'main',
      indexStatus: initialStatus,
      indexError: data.indexError || null,
      lastIndexedSha: data.lastIndexedSha || null,
      activeAgents: agents,
      settings: defaultSettings,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    memoryStore.repos.set(newRepo.id, newRepo);
    return newRepo;
  }

  public async updateRepoIndexStatus(
    repoId: string,
    status: 'PENDING' | 'INDEXING' | 'INDEXED' | 'FAILED',
    lastIndexedSha?: string | null,
    indexError?: string | null
  ): Promise<void> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const updateData: any = {
        indexStatus: status,
        updatedAt: new Date()
      };
      if (lastIndexedSha !== undefined) updateData.lastIndexedSha = lastIndexedSha;
      if (indexError !== undefined) updateData.indexError = indexError;

      await db.update(schema.repos)
        .set(updateData)
        .where(eq(schema.repos.id, repoId));
      return;
    }

    const repo = memoryStore.repos.get(repoId);
    if (repo) {
      repo.indexStatus = status;
      if (lastIndexedSha !== undefined) repo.lastIndexedSha = lastIndexedSha;
      if (indexError !== undefined) repo.indexError = indexError;
      repo.updatedAt = new Date();
    }
  }

  public async deleteRepoByGithubId(githubRepoId: number): Promise<void> {
    if (this.isConnectedToPg) {
      const db = getDb();
      await db.delete(schema.repos).where(eq(schema.repos.githubRepoId, githubRepoId));
      return;
    }
    for (const [id, r] of memoryStore.repos.entries()) {
      if (r.githubRepoId === githubRepoId) {
        memoryStore.repos.delete(id);
      }
    }
  }

  public async deleteRepo(repoId: string): Promise<void> {
    if (this.isConnectedToPg) {
      const db = getDb();
      await db.delete(schema.repos).where(eq(schema.repos.id, repoId));
      return;
    }
    memoryStore.repos.delete(repoId);
  }

  public async getRepoByGithubId(githubRepoId: number): Promise<Repo | null> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.repos).where(eq(schema.repos.githubRepoId, githubRepoId));
      return (rows[0] as unknown as Repo) || null;
    }
    for (const r of memoryStore.repos.values()) {
      if (r.githubRepoId === githubRepoId) return r;
    }
    return null;
  }

  public async getRepoById(repoId: string): Promise<Repo | null> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.repos).where(eq(schema.repos.id, repoId));
      return (rows[0] as unknown as Repo) || null;
    }
    return memoryStore.repos.get(repoId) || null;
  }

  public async getRepoByFullName(fullName: string): Promise<Repo | null> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.repos).where(eq(schema.repos.fullName, fullName));
      return (rows[0] as unknown as Repo) || null;
    }
    for (const r of memoryStore.repos.values()) {
      if (r.fullName.toLowerCase() === fullName.toLowerCase()) return r;
    }
    return null;
  }

  public async listRepos(): Promise<Repo[]> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.repos);
      return rows as unknown as Repo[];
    }
    return Array.from(memoryStore.repos.values());
  }

  public async updateRepoSettings(repoId: string, settings: Partial<RepoSettings>): Promise<Repo | null> {
    const repo = await this.getRepoById(repoId);
    if (!repo) return null;
    const merged = { ...repo.settings, ...settings };

    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.update(schema.repos)
        .set({ settings: merged, updatedAt: new Date() })
        .where(eq(schema.repos.id, repoId))
        .returning();
      return (rows[0] as unknown as Repo) || null;
    }

    repo.settings = merged;
    return repo;
  }

  // --- Webhook Idempotency ---
  public async recordWebhookDelivery(deliveryId: string, event: string): Promise<boolean> {
    if (this.isConnectedToPg) {
      try {
        const pool = getDbPool();
        const res = await pool.query(
          'INSERT INTO webhook_deliveries (delivery_id, event, received_at, status) VALUES ($1, $2, NOW(), $3) ON CONFLICT (delivery_id) DO NOTHING',
          [deliveryId, event, 'received']
        );
        return (res.rowCount ?? 0) > 0;
      } catch (err: any) {
        logger.error({ err: err.message, deliveryId }, 'Failed to record webhook delivery');
        return false;
      }
    }

    if (memoryStore.deliveries.has(deliveryId)) {
      return false; // Already processed
    }
    memoryStore.deliveries.add(deliveryId);
    return true;
  }

  // --- Reviews ---
  public async createReview(data: {
    repoId: string;
    prNumber: number;
    headSha: string;
    model: string;
    promptVersion?: string;
  }): Promise<Review> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.insert(schema.reviews)
        .values({
          repoId: data.repoId,
          prNumber: data.prNumber,
          headSha: data.headSha,
          status: 'queued',
          model: data.model,
          promptVersion: data.promptVersion || 'v1.0'
        })
        .onConflictDoUpdate({
          target: [schema.reviews.repoId, schema.reviews.prNumber, schema.reviews.headSha],
          set: {
            status: 'queued',
            error: null
          }
        })
        .returning();

      return rows[0] as unknown as Review;
    }

    const key = `${data.repoId}:${data.prNumber}:${data.headSha}`;
    const review: Review = {
      id: crypto.randomUUID(),
      repoId: data.repoId,
      prNumber: data.prNumber,
      headSha: data.headSha,
      status: 'queued',
      model: data.model,
      promptVersion: data.promptVersion || 'v1.0',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0
    };
    memoryStore.reviews.set(key, review);
    return review;
  }

  public async getReview(id: string): Promise<Review | null> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.id, id));
      return (rows[0] as unknown as Review) || null;
    }
    for (const r of memoryStore.reviews.values()) {
      if (r.id === id) return r;
    }
    return null;
  }

  public async getReviews(repoId?: string, status?: string): Promise<Review[]> {
    if (this.isConnectedToPg) {
      const db = getDb();
      let query = db.select().from(schema.reviews);
      if (repoId) {
        query = query.where(eq(schema.reviews.repoId, repoId)) as any;
      }
      const rows = await query.orderBy(desc(schema.reviews.createdAt));
      return rows as unknown as Review[];
    }
    let list = Array.from(memoryStore.reviews.values());
    if (repoId) list = list.filter(r => r.repoId === repoId);
    if (status) list = list.filter(r => r.status === status);
    return list;
  }

  public async updateReviewStatus(
    id: string,
    status: Review['status'],
    details?: {
      startedAt?: Date;
      finishedAt?: Date;
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number;
      error?: string | null;
      summary?: string | null;
    }
  ): Promise<void> {
    if (this.isConnectedToPg) {
      const db = getDb();
      await db.update(schema.reviews)
        .set({
          status,
          ...(details?.startedAt && { startedAt: details.startedAt }),
          ...(details?.finishedAt && { finishedAt: details.finishedAt }),
          ...(details?.tokensIn !== undefined && { tokensIn: details.tokensIn }),
          ...(details?.tokensOut !== undefined && { tokensOut: details.tokensOut }),
          ...(details?.costUsd !== undefined && { costUsd: details.costUsd.toString() }),
          ...(details?.error !== undefined && { error: details.error }),
          ...(details?.summary !== undefined && { summary: details.summary })
        })
        .where(eq(schema.reviews.id, id));
      return;
    }

    for (const r of memoryStore.reviews.values()) {
      if (r.id === id) {
        r.status = status;
        if (details?.startedAt) r.startedAt = details.startedAt;
        if (details?.finishedAt) r.finishedAt = details.finishedAt;
        if (details?.tokensIn !== undefined) r.tokensIn = details.tokensIn;
        if (details?.tokensOut !== undefined) r.tokensOut = details.tokensOut;
        if (details?.costUsd !== undefined) r.costUsd = details.costUsd;
        if (details?.error !== undefined) r.error = details.error;
        if (details?.summary !== undefined) r.summary = details.summary;
        break;
      }
    }
  }

  // --- Stale Review Cancellation ---
  public async findRunningReviewsForPr(repoId: string, prNumber: number, excludeHeadSha: string): Promise<Review[]> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.reviews).where(
        and(
          eq(schema.reviews.repoId, repoId),
          eq(schema.reviews.prNumber, prNumber),
          sql`${schema.reviews.headSha} != ${excludeHeadSha}`,
          sql`${schema.reviews.status} IN ('queued', 'running')`
        )
      );
      return rows as unknown as Review[];
    }

    return Array.from(memoryStore.reviews.values()).filter(
      r => r.repoId === repoId && r.prNumber === prNumber && r.headSha !== excludeHeadSha && (r.status === 'queued' || r.status === 'running')
    );
  }

  // --- Findings ---
  public async saveFindings(reviewId: string, findingsList: Finding[]): Promise<Finding[]> {
    if (findingsList.length === 0) return [];

    if (this.isConnectedToPg) {
      const db = getDb();
      const inserted: Finding[] = [];
      for (const f of findingsList) {
        const rows = await db.insert(schema.findings)
          .values({
            reviewId,
            agent: f.agent,
            filePath: f.file,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            severity: f.severity,
            category: f.category,
            title: f.title,
            message: f.message,
            evidence: f.evidence,
            suggestion: f.suggestion,
            confidence: f.confidence.toString(),
            fingerprint: f.fingerprint || 'fp',
            status: f.status || 'posted',
            githubCommentId: f.githubCommentId
          })
          .onConflictDoUpdate({
            target: [schema.findings.reviewId, schema.findings.fingerprint],
            set: {
              status: f.status || 'posted',
              githubCommentId: f.githubCommentId
            }
          })
          .returning();

        inserted.push(rows[0] as unknown as Finding);
      }
      return inserted;
    }

    const saved: Finding[] = [];
    for (const f of findingsList) {
      const id = f.id || crypto.randomUUID();
      const item = { ...f, id, reviewId };
      memoryStore.findings.set(id, item);
      saved.push(item);
    }
    return saved;
  }

  public async getFindingsForReview(reviewId: string): Promise<Finding[]> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.findings).where(eq(schema.findings.reviewId, reviewId));
      return rows.map(r => ({
        id: r.id,
        reviewId: r.reviewId,
        agent: r.agent,
        file: r.filePath,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        severity: r.severity as any,
        category: r.category as any,
        title: r.title,
        message: r.message,
        evidence: r.evidence,
        suggestion: r.suggestion ?? undefined,
        confidence: parseFloat(r.confidence),
        fingerprint: r.fingerprint,
        status: r.status as any,
        githubCommentId: r.githubCommentId ?? undefined
      }));
    }

    return Array.from(memoryStore.findings.values()).filter(f => f.reviewId === reviewId);
  }

  // --- Feedback ---
  public async addFeedback(data: { findingId: string; userLogin: string; value: 1 | -1; reason?: string }): Promise<Feedback> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.insert(schema.feedback)
        .values({
          findingId: data.findingId,
          userLogin: data.userLogin,
          value: data.value,
          reason: data.reason
        })
        .returning();
      return rows[0] as unknown as Feedback;
    }

    const id = crypto.randomUUID();
    const fb: Feedback = { id, ...data, createdAt: new Date() };
    memoryStore.feedback.set(id, fb);
    return fb;
  }

  public async getUnhelpfulFingerprints(repoId: string): Promise<Set<string>> {
    const unhelpful = new Set<string>();

    if (this.isConnectedToPg) {
      const pool = getDbPool();
      const res = await pool.query(`
        SELECT f.fingerprint 
        FROM findings f
        JOIN reviews r ON f.review_id = r.id
        JOIN feedback fb ON f.id = fb.finding_id
        WHERE r.repo_id = $1 AND fb.value = -1
      `, [repoId]);
      for (const row of res.rows) {
        unhelpful.add(row.fingerprint);
      }
      return unhelpful;
    }

    for (const fb of memoryStore.feedback.values()) {
      if (fb.value === -1) {
        const finding = memoryStore.findings.get(fb.findingId);
        if (finding && finding.fingerprint) {
          unhelpful.add(finding.fingerprint);
        }
      }
    }
    return unhelpful;
  }

  // --- Code Chunks & Search ---
  public async upsertCodeChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    if (this.isConnectedToPg) {
      const pool = getDbPool();
      for (const c of chunks) {
        const vectorStr = c.embedding ? `[${c.embedding.join(',')}]` : null;
        await pool.query(
          `INSERT INTO code_chunks (id, repo_id, file_path, symbol_name, symbol_kind, language, start_line, end_line, content, content_hash, commit_sha, embedding, tsv)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::vector, to_tsvector('english', $13))
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             content_hash = EXCLUDED.content_hash,
             commit_sha = EXCLUDED.commit_sha,
             embedding = EXCLUDED.embedding,
             tsv = EXCLUDED.tsv`,
          [
            c.id || crypto.randomUUID(),
            c.repoId,
            c.filePath,
            c.symbolName,
            c.symbolKind,
            c.language,
            c.startLine,
            c.endLine,
            c.content,
            c.contentHash,
            c.commitSha,
            vectorStr,
            `${c.filePath} ${c.symbolName} ${c.content}`
          ]
        );
      }
      return;
    }

    for (const c of chunks) {
      const id = c.id || crypto.randomUUID();
      memoryStore.chunks.set(id, { ...c, id });
    }
  }

  public async deleteChunksForFiles(repoId: string, filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;

    if (this.isConnectedToPg) {
      const pool = getDbPool();
      await pool.query(
        'DELETE FROM code_chunks WHERE repo_id = $1 AND file_path = ANY($2::text[])',
        [repoId, filePaths]
      );
      return;
    }

    for (const [id, c] of memoryStore.chunks.entries()) {
      if (c.repoId === repoId && filePaths.includes(c.filePath)) {
        memoryStore.chunks.delete(id);
      }
    }
  }

  public async searchSimilarChunks(repoId: string, embedding: number[], limit = 8): Promise<CodeChunk[]> {
    if (this.isConnectedToPg) {
      const pool = getDbPool();
      const vectorStr = `[${embedding.join(',')}]`;
      const res = await pool.query(
        `SELECT id, repo_id as "repoId", file_path as "filePath", symbol_name as "symbolName",
                symbol_kind as "symbolKind", language, start_line as "startLine", end_line as "endLine",
                content, content_hash as "contentHash", commit_sha as "commitSha"
         FROM code_chunks
         WHERE repo_id = $1 AND embedding IS NOT NULL
         ORDER BY embedding <=> $2::vector
         LIMIT $3`,
        [repoId, vectorStr, limit]
      );
      return res.rows;
    }

    // In-memory cosine similarity fallback
    const cosineSim = (a: number[], b: number[]) => {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    };

    const results = Array.from(memoryStore.chunks.values())
      .filter(c => c.repoId === repoId && c.embedding && c.embedding.length > 0)
      .map(c => ({ chunk: c, score: cosineSim(c.embedding!, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.chunk);

    return results;
  }

  public async searchKeywordChunks(repoId: string, query: string, limit = 8): Promise<CodeChunk[]> {
    if (this.isConnectedToPg) {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT id, repo_id as "repoId", file_path as "filePath", symbol_name as "symbolName",
                symbol_kind as "symbolKind", language, start_line as "startLine", end_line as "endLine",
                content, content_hash as "contentHash", commit_sha as "commitSha"
         FROM code_chunks
         WHERE repo_id = $1 AND tsv @@ plainto_tsquery('english', $2)
         LIMIT $3`,
        [repoId, query, limit]
      );
      return res.rows;
    }

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = Array.from(memoryStore.chunks.values())
      .filter(c => {
        if (c.repoId !== repoId) return false;
        const text = `${c.filePath} ${c.symbolName} ${c.content}`.toLowerCase();
        return words.some(w => text.includes(w));
      })
      .slice(0, limit);

    return results;
  }

  // --- Symbol Edges ---
  public async upsertSymbolEdges(edges: SymbolEdge[]): Promise<void> {
    if (edges.length === 0) return;
    if (this.isConnectedToPg) {
      const pool = getDbPool();
      for (const e of edges) {
        await pool.query(
          'INSERT INTO symbol_edges (id, repo_id, from_chunk_id, to_symbol_name, kind) VALUES ($1, $2, $3, $4, $5)',
          [e.id || crypto.randomUUID(), e.repoId, e.fromChunkId, e.toSymbolName, e.kind]
        );
      }
      return;
    }
    memoryStore.edges.push(...edges);
  }

  public async findCallers(repoId: string, symbolName: string, limit = 5): Promise<CodeChunk[]> {
    if (this.isConnectedToPg) {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT c.id, c.repo_id as "repoId", c.file_path as "filePath", c.symbol_name as "symbolName",
                c.symbol_kind as "symbolKind", c.language, c.start_line as "startLine", c.end_line as "endLine",
                c.content, c.content_hash as "contentHash", c.commit_sha as "commitSha"
         FROM symbol_edges e
         JOIN code_chunks c ON e.from_chunk_id = c.id
         WHERE e.repo_id = $1 AND e.to_symbol_name = $2 AND e.kind = 'calls'
         LIMIT $3`,
        [repoId, symbolName, limit]
      );
      return res.rows;
    }

    const chunkIds = memoryStore.edges
      .filter(e => e.repoId === repoId && e.toSymbolName === symbolName && e.kind === 'calls')
      .slice(0, limit)
      .map(e => e.fromChunkId);

    return chunkIds.map(id => memoryStore.chunks.get(id)!).filter(Boolean);
  }

  public async findCallees(repoId: string, chunkId: string, limit = 5): Promise<CodeChunk[]> {
    if (this.isConnectedToPg) {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT c.id, c.repo_id as "repoId", c.file_path as "filePath", c.symbol_name as "symbolName",
                c.symbol_kind as "symbolKind", c.language, c.start_line as "startLine", c.end_line as "endLine",
                c.content, c.content_hash as "contentHash", c.commit_sha as "commitSha"
         FROM symbol_edges e
         JOIN code_chunks c ON e.to_symbol_name = c.symbol_name AND c.repo_id = e.repo_id
         WHERE e.from_chunk_id = $1 AND e.kind = 'calls'
         LIMIT $2`,
        [chunkId, limit]
      );
      return res.rows;
    }

    const targetNames = new Set(
      memoryStore.edges
        .filter(e => e.fromChunkId === chunkId && e.kind === 'calls')
        .slice(0, limit)
        .map(e => e.toSymbolName)
    );

    return Array.from(memoryStore.chunks.values())
      .filter(c => c.repoId === repoId && targetNames.has(c.symbolName))
      .slice(0, limit);
  }

  // --- Eval Runs ---
  public async saveEvalRun(data: {
    gitSha?: string;
    datasetVersion: string;
    model: string;
    promptVersion: string;
    metrics: EvalRunMetrics;
    details?: any;
  }): Promise<string> {
    const id = crypto.randomUUID();
    if (this.isConnectedToPg) {
      const db = getDb();
      await db.insert(schema.evalRuns).values({
        id,
        gitSha: data.gitSha,
        datasetVersion: data.datasetVersion,
        model: data.model,
        promptVersion: data.promptVersion,
        precision: data.metrics.precision.toString(),
        recall: data.metrics.recall.toString(),
        fpRate: data.metrics.falsePositiveRate.toString(),
        locationAccuracy: data.metrics.locationAccuracy.toString(),
        avgCostUsd: data.metrics.avgCostUsd.toString(),
        details: data.details
      });
      return id;
    }

    memoryStore.evalRuns.push({ id, ...data, createdAt: new Date() });
    return id;
  }

  public async listEvalRuns(): Promise<any[]> {
    if (this.isConnectedToPg) {
      const db = getDb();
      const rows = await db.select().from(schema.evalRuns).orderBy(desc(schema.evalRuns.createdAt));
      return rows;
    }
    return memoryStore.evalRuns;
  }
}

export const dbService = new DatabaseService();

