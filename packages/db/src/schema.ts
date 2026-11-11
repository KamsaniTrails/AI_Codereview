import {
  pgTable,
  text,
  integer,
  bigint,
  varchar,
  timestamp,
  numeric,
  jsonb,
  uuid,
  primaryKey,
  uniqueIndex,
  index,
  customType
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { RepoSettings } from '@ai-reviewer/core';

// Custom type for pgvector vector(N)
const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (!value) return [];
    return value
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(Number);
  }
});

// Custom type for PostgreSQL tsvector
const tsvectorType = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: string): string {
    return value;
  }
});

export const installations = pgTable('installations', {
  id: integer('id').primaryKey(), // GitHub installation ID
  accountLogin: varchar('account_login', { length: 255 }).notNull(),
  accountType: varchar('account_type', { length: 50 }).notNull(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  installationId: integer('installation_id')
    .notNull()
    .references(() => installations.id, { onDelete: 'cascade' }),
  githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  defaultBranch: varchar('default_branch', { length: 100 }).default('main').notNull(),
  lastIndexedSha: varchar('last_indexed_sha', { length: 40 }),
  indexStatus: varchar('index_status', { length: 50 }).default('PENDING').notNull(),
  indexError: text('index_error'),
  activeAgents: jsonb('active_agents').$type<string[]>().default(sql`'["bug", "security", "quality", "test"]'::jsonb`),
  settings: jsonb('settings').$type<RepoSettings>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  deliveryId: varchar('delivery_id', { length: 100 }).primaryKey(),
  event: varchar('event', { length: 100 }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  status: varchar('status', { length: 50 }).default('received').notNull()
});

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    prNumber: integer('pr_number').notNull(),
    headSha: varchar('head_sha', { length: 40 }).notNull(),
    status: varchar('status', { length: 50 }).default('queued').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    model: varchar('model', { length: 100 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 50 }).default('v1.0').notNull(),
    tokensIn: integer('tokens_in').default(0),
    tokensOut: integer('tokens_out').default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).default('0'),
    error: text('error'),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('review_repo_pr_sha_idx').on(table.repoId, table.prNumber, table.headSha),
    index('review_repo_status_idx').on(table.repoId, table.status)
  ]
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    agent: varchar('agent', { length: 100 }).notNull(),
    filePath: text('file_path').notNull(),
    lineStart: integer('line_start').notNull(),
    lineEnd: integer('line_end').notNull(),
    severity: varchar('severity', { length: 50 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    evidence: text('evidence').notNull(),
    suggestion: text('suggestion'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    status: varchar('status', { length: 50 }).default('posted').notNull(),
    githubCommentId: varchar('github_comment_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('finding_review_fingerprint_idx').on(table.reviewId, table.fingerprint),
    index('finding_review_id_idx').on(table.reviewId),
    index('finding_fingerprint_idx').on(table.fingerprint)
  ]
);

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  findingId: uuid('finding_id')
    .notNull()
    .references(() => findings.id, { onDelete: 'cascade' }),
  userLogin: varchar('user_login', { length: 255 }).notNull(),
  value: integer('value').notNull(), // +1 or -1
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const codeChunks = pgTable(
  'code_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    symbolName: text('symbol_name').notNull(),
    symbolKind: varchar('symbol_kind', { length: 50 }).notNull(),
    language: varchar('language', { length: 50 }).notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    content: text('content').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    commitSha: varchar('commit_sha', { length: 40 }).notNull(),
    embedding: vectorType('embedding'),
    tsv: tsvectorType('tsv'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('code_chunk_repo_file_idx').on(table.repoId, table.filePath),
    index('code_chunk_content_hash_idx').on(table.contentHash)
  ]
);

export const fileIndex = pgTable(
  'file_index',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileHash: varchar('file_hash', { length: 64 }).notNull(),
    indexedSha: varchar('indexed_sha', { length: 40 }).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.repoId, table.filePath] })
  ]
);

export const symbolEdges = pgTable(
  'symbol_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    fromChunkId: uuid('from_chunk_id')
      .notNull()
      .references(() => codeChunks.id, { onDelete: 'cascade' }),
    toSymbolName: text('to_symbol_name').notNull(),
    kind: varchar('kind', { length: 20 }).notNull() // 'calls' | 'imports'
  },
  (table) => [
    index('symbol_edges_repo_target_idx').on(table.repoId, table.toSymbolName),
    index('symbol_edges_from_idx').on(table.fromChunkId)
  ]
);

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  gitSha: varchar('git_sha', { length: 40 }),
  datasetVersion: varchar('dataset_version', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  promptVersion: varchar('prompt_version', { length: 50 }).notNull(),
  precision: numeric('precision', { precision: 5, scale: 4 }).notNull(),
  recall: numeric('recall', { precision: 5, scale: 4 }).notNull(),
  fpRate: numeric('fp_rate', { precision: 5, scale: 4 }).notNull(),
  locationAccuracy: numeric('location_accuracy', { precision: 5, scale: 4 }),
  avgCostUsd: numeric('avg_cost_usd', { precision: 10, scale: 6 }),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubUserId: bigint('github_user_id', { mode: 'number' }).notNull().unique(),
  login: varchar('login', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

