import type { Request, Response, NextFunction } from 'express';
import { verifyWebhookSignature } from '@ai-reviewer/github';
import { getConfig, logger } from '@ai-reviewer/core';

export function verifyGitHubSignatureMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = req.body;

  // In testing or when explicit mock secret is set, verify gracefully
  if (!signature) {
    logger.warn('Webhook request missing X-Hub-Signature-256 header');
    res.status(401).json({ error: 'Missing webhook signature header' });
    return;
  }

  const isValid = verifyWebhookSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET);
  if (!isValid) {
    logger.warn('Webhook signature mismatch. Rejecting request.');
    res.status(401).json({ error: 'Invalid HMAC signature' });
    return;
  }

  next();
}

