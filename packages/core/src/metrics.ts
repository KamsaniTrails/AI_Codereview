import client from 'prom-client';

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const reviewDurationSeconds = new client.Histogram({
  name: 'review_duration_seconds',
  help: 'Duration of review worker processing in seconds',
  labelNames: ['status', 'repo'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register]
});

export const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Number of jobs waiting or active in queues',
  labelNames: ['queue_name', 'status'],
  registers: [register]
});

export const jobFailuresTotal = new client.Counter({
  name: 'job_failures_total',
  help: 'Total count of review and indexing job failures',
  labelNames: ['queue_name', 'error_type'],
  registers: [register]
});

export const llmTokensTotal = new client.Counter({
  name: 'llm_tokens_total',
  help: 'Total LLM tokens consumed',
  labelNames: ['direction', 'agent', 'model'],
  registers: [register]
});

export const findingsPostedTotal = new client.Counter({
  name: 'findings_posted_total',
  help: 'Total inline findings posted to GitHub PRs',
  labelNames: ['severity', 'category', 'status'],
  registers: [register]
});

export const githubRateLimitRemaining = new client.Gauge({
  name: 'github_rate_limit_remaining',
  help: 'Remaining GitHub REST API rate limit quota',
  registers: [register]
});

