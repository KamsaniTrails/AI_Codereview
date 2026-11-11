import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getConfig, logger } from '@ai-reviewer/core';
import { register } from '@ai-reviewer/core';
import { initializeDatabase, getDbPool } from '@ai-reviewer/db';
import { verifyGitHubSignatureMiddleware } from './middleware/verifySignature.js';
import { webhookRouter } from './routes/webhooks.js';
import { restApiRouter } from './routes/api.js';
import { getRedisClient } from './queue.js';

export function createServer(): express.Express {
  const app = express();

  // Basic security and CORS headers
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));

  // 1. GitHub Webhook Route with RAW body for HMAC validation (CRITICAL: must precede json parser)
  app.use(
    '/webhooks',
    express.raw({ type: 'application/json' }),
    verifyGitHubSignatureMiddleware,
    webhookRouter
  );

  // 2. Standard JSON body parsing for all other routes
  app.use(express.json());

  // 3. Health & Observability Endpoints
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/readyz', async (req, res) => {
    try {
      // Check PostgreSQL
      await getDbPool().query('SELECT 1');
      // Check Redis
      const redis = getRedisClient();
      await redis.ping();
      res.status(200).json({ status: 'ready', database: 'connected', redis: 'connected' });
    } catch (err: any) {
      res.status(503).json({ status: 'degraded', error: err.message });
    }
  });

  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  });

  // 4. REST API routes for dashboard
  app.use('/api', restApiRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const config = getConfig();
  const app = createServer();

  initializeDatabase()
    .catch((err) => logger.warn({ err: err.message }, 'Database init warning'))
    .finally(() => {
      app.listen(config.PORT, () => {
        logger.info({ port: config.PORT }, `AI Code Review API server running on http://localhost:${config.PORT}`);
      });
    });
}

