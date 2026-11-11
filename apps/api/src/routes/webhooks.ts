import { Router, type Request, type Response } from 'express';
import {
  logger,
  PullRequestWebhookSchema,
  PushWebhookSchema,
  InstallationWebhookSchema,
  InstallationRepositoriesWebhookSchema,
  PullRequestReviewThreadSchema
} from '@ai-reviewer/core';
import { dbService } from '@ai-reviewer/db';
import {
  enqueueReviewJob,
  enqueueIndexJob,
  flagReviewAsCancelled
} from '../queue.js';

export const webhookRouter = Router();

webhookRouter.post('/github', async (req: Request, res: Response): Promise<void> => {
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  if (!event || !deliveryId) {
    res.status(400).json({ error: 'Missing required GitHub headers' });
    return;
  }

  // 1. Idempotency Check: Reject already processed delivery IDs immediately
  const isNew = await dbService.recordWebhookDelivery(deliveryId, event);
  if (!isNew) {
    logger.info({ deliveryId, event }, 'Duplicate webhook delivery received. Returning 200 OK.');
    res.status(200).json({ message: 'Delivery already processed' });
    return;
  }

  // Parse raw body buffer to JSON
  let payload: any;
  try {
    payload = JSON.parse(req.body.toString('utf-8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  // 2. Event Dispatching
  switch (event) {
    case 'pull_request': {
      const parsed = PullRequestWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        logger.warn({ errors: parsed.error.format() }, 'Pull request webhook schema validation failed');
        res.status(400).json({ error: 'Invalid pull request payload' });
        return;
      }

      const { action, pull_request: pr, repository: repo, installation } = parsed.data;
      const relevantActions = ['opened', 'synchronize', 'reopened', 'ready_for_review'];

      if (!relevantActions.includes(action)) {
        res.status(200).json({ message: `Ignored action: ${action}` });
        return;
      }

      // Ignore bots
      if (pr.user.type === 'Bot' || pr.user.login.endsWith('[bot]')) {
        logger.info({ author: pr.user.login }, 'Ignoring pull request from bot author');
        res.status(200).json({ message: 'Ignored bot author' });
        return;
      }

      // Ensure repo and installation exist in database
      const dbRepo = await dbService.upsertRepo({
        installationId: installation.id,
        githubRepoId: repo.id,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch
      });

      // Check draft settings
      if (pr.draft && !dbRepo.settings.reviewDrafts) {
        logger.info({ prNumber: pr.number }, 'Ignoring draft PR per repository settings');
        res.status(200).json({ message: 'Draft PR ignored' });
        return;
      }

      // 3. Stale Review Cancellation on synchronize
      if (action === 'synchronize') {
        const staleReviews = await dbService.findRunningReviewsForPr(dbRepo.id, pr.number, pr.head.sha);
        for (const stale of staleReviews) {
          logger.info({ staleReviewId: stale.id, oldSha: stale.headSha }, 'Cancelling stale review for PR');
          await dbService.updateReviewStatus(stale.id, 'cancelled');
          await flagReviewAsCancelled(stale.id);
        }
      }

      // Create review record in DB
      await dbService.createReview({
        repoId: dbRepo.id,
        prNumber: pr.number,
        headSha: pr.head.sha,
        model: 'gpt-4o'
      });

      // Enqueue review job to BullMQ
      const jobId = await enqueueReviewJob({
        installationId: installation.id,
        repoId: dbRepo.id,
        repoFullName: repo.full_name,
        prNumber: pr.number,
        headSha: pr.head.sha,
        baseSha: pr.base.sha,
        deliveryId
      });

      // Fast response under 1 second (202 Accepted)
      res.status(202).json({
        message: 'Review job queued successfully',
        jobId,
        reviewStatus: 'queued'
      });
      return;
    }

    case 'push': {
      const parsed = PushWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        res.status(200).json({ message: 'Push ignored' });
        return;
      }

      const { repository: repo, installation, ref, after: headSha, before: baseSha } = parsed.data;
      if (ref === `refs/heads/${repo.default_branch}`) {
        const dbRepo = await dbService.upsertRepo({
          installationId: installation.id,
          githubRepoId: repo.id,
          fullName: repo.full_name,
          defaultBranch: repo.default_branch
        });

        await enqueueIndexJob({
          installationId: installation.id,
          repoId: dbRepo.id,
          repoFullName: repo.full_name,
          commitSha: headSha,
          defaultBranch: repo.default_branch,
          isIncremental: Boolean(baseSha && baseSha !== '0000000000000000000000000000000000000000'),
          lastIndexedSha: baseSha
        });
      }

      res.status(202).json({ message: 'Push received and index job dispatched' });
      return;
    }

    case 'installation': {
      const parsed = InstallationWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        logger.warn({ errors: parsed.error.format() }, 'Invalid installation webhook payload');
        res.status(400).json({ error: 'Invalid installation payload' });
        return;
      }

      const { action, installation, repositories = [] } = parsed.data;

      if (action === 'created') {
        await dbService.upsertInstallation({
          id: installation.id,
          accountLogin: installation.account.login,
          accountType: installation.account.type,
          suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null
        });

        for (const r of repositories) {
          const dbRepo = await dbService.upsertRepo({
            installationId: installation.id,
            githubRepoId: r.id,
            fullName: r.full_name,
            indexStatus: 'PENDING'
          });

          await enqueueIndexJob({
            installationId: installation.id,
            repoId: dbRepo.id,
            repoFullName: r.full_name,
            commitSha: 'HEAD',
            defaultBranch: 'main',
            isIncremental: false
          });
        }
      } else if (action === 'deleted') {
        await dbService.deleteInstallation(installation.id);
      } else if (action === 'suspend') {
        await dbService.upsertInstallation({
          id: installation.id,
          accountLogin: installation.account.login,
          accountType: installation.account.type,
          suspendedAt: new Date()
        });
      } else if (action === 'unsuspend') {
        await dbService.upsertInstallation({
          id: installation.id,
          accountLogin: installation.account.login,
          accountType: installation.account.type,
          suspendedAt: null
        });
      }

      res.status(200).json({ message: `Installation ${action} processed` });
      return;
    }

    case 'installation_repositories': {
      const parsed = InstallationRepositoriesWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        logger.warn({ errors: parsed.error.format() }, 'Invalid installation_repositories webhook payload');
        res.status(400).json({ error: 'Invalid installation_repositories payload' });
        return;
      }

      const { action, installation, repositories_added, repositories_removed } = parsed.data;

      if (action === 'added') {
        for (const r of repositories_added) {
          const dbRepo = await dbService.upsertRepo({
            installationId: installation.id,
            githubRepoId: r.id,
            fullName: r.full_name,
            defaultBranch: r.default_branch || 'main',
            indexStatus: 'PENDING'
          });

          await enqueueIndexJob({
            installationId: installation.id,
            repoId: dbRepo.id,
            repoFullName: r.full_name,
            commitSha: 'HEAD',
            defaultBranch: dbRepo.defaultBranch,
            isIncremental: false
          });
        }
      } else if (action === 'removed') {
        for (const r of repositories_removed) {
          logger.info({ repoFullName: r.full_name, githubRepoId: r.id }, 'Removing repository uninstalled from GitHub');
          await dbService.deleteRepoByGithubId(r.id);
        }
      }

      res.status(200).json({ message: `Installation repositories ${action} processed` });
      return;
    }

    case 'pull_request_review_thread': {
      const parsed = PullRequestReviewThreadSchema.safeParse(payload);
      if (parsed.success) {
        // Spec page 20: "A resolved thread is a weak positive signal"
        logger.info({ action: parsed.data.action }, 'Pull request review thread event tracked');
      }
      res.status(200).json({ message: 'Thread event acknowledged' });
      return;
    }

    default:
      res.status(200).json({ message: `Unhandled event: ${event}` });
      return;
  }
});

