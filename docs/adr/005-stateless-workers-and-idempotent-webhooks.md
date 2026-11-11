# ADR 005: Stateless Workers and Idempotent Webhook Processing

## Status
Accepted

## Context
GitHub webhooks guarantee at-least-once delivery. GitHub can and does redeliver payloads when network blips occur, or developers push multiple commits in rapid succession. Furthermore, worker nodes can crash, be evicted, or restart during reviews.

## Decision
We implemented a strict four-layer idempotency and safety model:
1. **Raw Body HMAC Verification**: `express.raw()` preserves exact request payload bytes to prevent tampered or forged webhooks.
2. **Delivery ID Idempotency**: Primary key constraint on `webhook_deliveries(delivery_id)`. Re-delivered webhooks insert with `ON CONFLICT DO NOTHING` and return HTTP 200 immediately.
3. **Queue Job ID Uniqueness**: BullMQ review job ID is deterministic (`repoId:prNumber:headSha`).
4. **Deterministic Finding Fingerprints**: Each finding is fingerprinted as a hash of `(file, category, normalized_title, nearest_symbol)`. Across repeated runs or commits, identical findings share the same fingerprint, preventing duplicate inline comments on GitHub.

## Rationale
- Workers are completely stateless and can scale horizontally across multiple containers or instances.
- Re-running a review job after a crash safely resumes without posting duplicate PR comments.

