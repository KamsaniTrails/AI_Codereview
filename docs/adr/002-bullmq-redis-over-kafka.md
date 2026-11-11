# ADR 002: Use BullMQ + Redis Over Apache Kafka / RabbitMQ

## Status
Accepted

## Context
When a pull request webhook arrives, the API must verify, deduplicate, filter, and respond with HTTP 202 in under 1 second. Code review execution takes from 10 to 60 seconds due to LLM calls and static analysis. We needed an asynchronous job queue with:
- Job deduplication by custom ID (`repoId:prNumber:headSha`)
- Debounce delays (10–20s) so rapid pushes collapse into a single review
- Stale job cancellation when a newer commit arrives mid-review
- Exponential backoff with jitter and Dead-Letter Queue (DLQ) support

## Decision
We chose **BullMQ backed by Redis**.

## Rationale
1. **Built-in Job Deduplication**:
   BullMQ allows explicit `jobId` keys. When GitHub redelivers or rapid events trigger, setting `jobId = repoId:prNumber:headSha` guarantees the exact same commit is never queued twice.
2. **Delayed Execution & Debouncing**:
   BullMQ's native `delay` parameter allows delaying a review job by 15 seconds. If the developer pushes another commit 5 seconds later, the earlier job is cancelled and superseded before workers even begin LLM calls.
3. **Mid-Flight Cancellation**:
   Using Redis keys (`cancel:<reviewId>`), our worker pipeline checks cancellation between stages and aborts pending LLM/HTTP calls instantly via `AbortController`.
4. **Lightweight Operational Footprint**:
   Redis is fast, resilient, and trivial to run locally via Docker and in production via managed services (e.g., Redis Cloud or Upstash).

## Trade-offs
Kafka offers higher stream retention and massive event streaming throughput, but lacks native job delays, simple job cancellation by ID, and requires ZooKeeper/KRaft cluster maintenance that adds unnecessary complexity for job queue semantics.

