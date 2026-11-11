# ADR 001: Use PostgreSQL + pgvector Instead of Dedicated Vector DB (Pinecone / Qdrant)

## Status
Accepted

## Context
Our AI Code Review Platform requires vector indexing and semantic similarity search across repository code chunks alongside relational entities: installations, repositories, reviews, findings, and user feedback.

We evaluated two architectural approaches:
1. **Decoupled Architecture**: PostgreSQL for relational tenant data + external managed vector database (e.g., Pinecone or Qdrant).
2. **Unified Architecture**: PostgreSQL 16 with the `pgvector` extension for both relational tables and vector embeddings.

## Decision
We chose **PostgreSQL 16 with pgvector**.

## Rationale
1. **Atomic Transactions & Tenant Isolation**:
   When an installation is uninstalled (`installation.deleted`), an `ON DELETE CASCADE` in PostgreSQL purges all tenant repositories, reviews, findings, and indexed vectors in a single atomic transaction. With a decoupled external vector DB, orphaned embeddings or synchronization lag can result in cross-tenant data leaks.
2. **Hybrid Search in One Engine**:
   We can perform vector cosine similarity search alongside PostgreSQL's native `tsvector` full-text keyword search and join across symbol edges (call graph) in one query.
3. **Operational Simplicity**:
   A single database reduces operational overhead, connection pool management, backup strategies, and infrastructure cost. One backup restores both relational metadata and the code vector index.

## Trade-offs & Mitigations
- *Trade-off*: Pure dedicated vector DBs can scale to billions of vectors with faster index build times than early pgvector versions.
- *Mitigation*: pgvector with HNSW indexing provides sub-10ms retrieval for repos up to hundreds of thousands of code chunks. If an installation exceeds tens of millions of chunks, pgvector can be sharded or migrated to a dedicated cluster with zero changes to the `CodeChunk` domain interface.

