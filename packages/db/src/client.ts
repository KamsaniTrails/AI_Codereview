import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { logger, getConfig } from '@ai-reviewer/core';
import * as schema from './schema.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbPool(): pg.Pool {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      logger.error({ err: err.message }, 'Unexpected error on idle PostgreSQL client');
    });
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    const p = getDbPool();
    dbInstance = drizzle(p, { schema });
  }
  return dbInstance;
}

/**
 * Ensures the pgvector extension and required custom SQL tables/indexes exist.
 */
export async function initializeDatabase(): Promise<void> {
  const p = getDbPool();
  try {
    const client = await p.connect();
    try {
      // 1. Enable pgvector
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      logger.info('pgvector extension enabled');

      // 2. Run DDL initialization if needed
      await client.query(`
        CREATE TABLE IF NOT EXISTS installations (
          id INTEGER PRIMARY KEY,
          account_login VARCHAR(255) NOT NULL,
          account_type VARCHAR(50) NOT NULL,
          suspended_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS repos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
          github_repo_id BIGINT NOT NULL UNIQUE,
          full_name VARCHAR(255) NOT NULL,
          default_branch VARCHAR(100) DEFAULT 'main' NOT NULL,
          last_indexed_sha VARCHAR(40),
          index_status VARCHAR(50) DEFAULT 'pending' NOT NULL,
          settings JSONB DEFAULT '{}'::jsonb NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          delivery_id VARCHAR(100) PRIMARY KEY,
          event VARCHAR(100) NOT NULL,
          received_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          processed_at TIMESTAMPTZ,
          status VARCHAR(50) DEFAULT 'received' NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          pr_number INTEGER NOT NULL,
          head_sha VARCHAR(40) NOT NULL,
          status VARCHAR(50) DEFAULT 'queued' NOT NULL,
          started_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ,
          model VARCHAR(100) NOT NULL,
          prompt_version VARCHAR(50) DEFAULT 'v1.0' NOT NULL,
          tokens_in INTEGER DEFAULT 0,
          tokens_out INTEGER DEFAULT 0,
          cost_usd NUMERIC(10, 6) DEFAULT 0,
          error TEXT,
          summary TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          UNIQUE (repo_id, pr_number, head_sha)
        );

        CREATE TABLE IF NOT EXISTS findings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
          agent VARCHAR(100) NOT NULL,
          file_path TEXT NOT NULL,
          line_start INTEGER NOT NULL,
          line_end INTEGER NOT NULL,
          severity VARCHAR(50) NOT NULL,
          category VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          evidence TEXT NOT NULL,
          suggestion TEXT,
          confidence NUMERIC(4, 3) NOT NULL,
          fingerprint VARCHAR(64) NOT NULL,
          status VARCHAR(50) DEFAULT 'posted' NOT NULL,
          github_comment_id VARCHAR(100),
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          UNIQUE (review_id, fingerprint)
        );

        CREATE TABLE IF NOT EXISTS feedback (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
          user_login VARCHAR(255) NOT NULL,
          value INTEGER NOT NULL,
          reason TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS code_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          file_path TEXT NOT NULL,
          symbol_name TEXT NOT NULL,
          symbol_kind VARCHAR(50) NOT NULL,
          language VARCHAR(50) NOT NULL,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          content TEXT NOT NULL,
          content_hash VARCHAR(64) NOT NULL,
          commit_sha VARCHAR(40) NOT NULL,
          embedding vector(1536),
          tsv TSVECTOR,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS file_index (
          repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          file_path TEXT NOT NULL,
          file_hash VARCHAR(64) NOT NULL,
          indexed_sha VARCHAR(40) NOT NULL,
          PRIMARY KEY (repo_id, file_path)
        );

        CREATE TABLE IF NOT EXISTS symbol_edges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          from_chunk_id UUID NOT NULL REFERENCES code_chunks(id) ON DELETE CASCADE,
          to_symbol_name TEXT NOT NULL,
          kind VARCHAR(20) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eval_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          git_sha VARCHAR(40),
          dataset_version VARCHAR(50) NOT NULL,
          model VARCHAR(100) NOT NULL,
          prompt_version VARCHAR(50) NOT NULL,
          precision NUMERIC(5, 4) NOT NULL,
          recall NUMERIC(5, 4) NOT NULL,
          fp_rate NUMERIC(5, 4) NOT NULL,
          location_accuracy NUMERIC(5, 4),
          avg_cost_usd NUMERIC(10, 6),
          details JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          github_user_id BIGINT NOT NULL UNIQUE,
          login VARCHAR(255) NOT NULL,
          avatar_url TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        -- Performance Indexes
        CREATE INDEX IF NOT EXISTS idx_code_chunks_repo_file ON code_chunks(repo_id, file_path);
        CREATE INDEX IF NOT EXISTS idx_code_chunks_content_hash ON code_chunks(content_hash);
        CREATE INDEX IF NOT EXISTS idx_code_chunks_tsv ON code_chunks USING GIN(tsv);
        CREATE INDEX IF NOT EXISTS idx_symbol_edges_repo_target ON symbol_edges(repo_id, to_symbol_name);
        CREATE INDEX IF NOT EXISTS idx_symbol_edges_from ON symbol_edges(from_chunk_id);
      `);

      // Try creating HNSW index if supported
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_code_chunks_hnsw 
          ON code_chunks USING hnsw (embedding vector_cosine_ops);
        `);
      } catch (hnswErr: any) {
        logger.warn({ err: hnswErr.message }, 'HNSW index creation skipped (requires pgvector >= 0.5.0)');
      }

      logger.info('Database schema and tables initialized successfully');
    } finally {
      client.release();
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'PostgreSQL connection not available; will use fallback memory store if required');
  }
}

