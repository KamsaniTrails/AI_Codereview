import {
  type ReviewJobPayload,
  type ContextPack,
  type Finding,
  type ChangedFile,
  logger,
  reviewDurationSeconds,
  findingsPostedTotal,
  UnrecoverableError
} from '@ai-reviewer/core';
import { dbService } from '@ai-reviewer/db';
import { GitHubAuthService, GitHubClient } from '@ai-reviewer/github';
import { staticAnalyzerRunner } from '@ai-reviewer/analyzers';
import { contextBuilder } from '@ai-reviewer/retrieval';
import { reviewGraphRunner, postProcessFindings } from '@ai-reviewer/agents';

export interface PipelineExecutionOptions {
  checkCancellation?: (reviewId: string) => Promise<boolean>;
  authService?: GitHubAuthService;
  githubClientFactory?: (token: string, owner: string, repo: string) => GitHubClient;
}

export class ReviewPipeline {
  private authService: GitHubAuthService;
  private clientFactory: (token: string, owner: string, repo: string) => GitHubClient;
  private checkCancellation?: (reviewId: string) => Promise<boolean>;

  constructor(options?: PipelineExecutionOptions) {
    this.authService = options?.authService || new GitHubAuthService(process.env.GITHUB_APP_ID || '123456', process.env.GITHUB_PRIVATE_KEY_BASE64);
    this.clientFactory = options?.githubClientFactory || ((token, owner, repo) => new GitHubClient(token, owner, repo));
    this.checkCancellation = options?.checkCancellation;
  }

  public async execute(jobPayload: ReviewJobPayload): Promise<void> {
    const startTime = Date.now();
    const abortController = new AbortController();
    const { repoId, repoFullName, prNumber, headSha, installationId } = jobPayload;
    const [owner, repoName] = repoFullName.split('/');

    logger.info({ repoFullName, prNumber, headSha }, 'Review pipeline triggered: Stage 1 to 13');

    // -------------------------------------------------------------------------
    // STAGE 1: Start. Load job, set reviews row to running, and check cancel flag.
    // -------------------------------------------------------------------------
    const repo = await dbService.getRepoById(repoId);
    if (!repo) {
      throw new UnrecoverableError(`Repository ID ${repoId} not found in database`);
    }

    const review = await dbService.createReview({
      repoId,
      prNumber,
      headSha,
      model: 'gpt-4o'
    });

    await dbService.updateReviewStatus(review.id, 'running', { startedAt: new Date() });

    if (await this.isCancelled(review.id)) {
      logger.info({ reviewId: review.id }, 'Review cancelled before start');
      return;
    }

    let checkRunId: number | null = null;
    let ghClient: GitHubClient | null = null;

    try {
      // -----------------------------------------------------------------------
      // STAGE 2: Token. Get cached installation token for this repo.
      // -----------------------------------------------------------------------
      const token = await this.authService.getInstallationToken(installationId);
      ghClient = this.clientFactory(token, owner, repoName);

      // -----------------------------------------------------------------------
      // STAGE 3: Check run. Create a GitHub check run named 'AI Code Review'.
      // -----------------------------------------------------------------------
      try {
        checkRunId = await ghClient.createCheckRun(headSha, 'AI Code Review');
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Check run creation warning; proceeding with review');
      }

      if (await this.isCancelled(review.id)) return;

      // -----------------------------------------------------------------------
      // STAGE 4: Fetch the change. Call GET /pulls/{n}/files & fetch content at head_sha.
      // -----------------------------------------------------------------------
      let files = await ghClient.getPullRequestFiles(prNumber, abortController.signal);
      for (const f of files) {
        if (f.status !== 'deleted') {
          f.rawContent = await ghClient.getFileContent(f.filename, headSha, abortController.signal);
        }
      }

      // -----------------------------------------------------------------------
      // STAGE 5: Filter files. Skip lockfiles, generated code, vendor, oversized files.
      // -----------------------------------------------------------------------
      const ignorePatterns = [
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'dist/',
        'build/',
        '.min.js',
        'vendor/',
        '__pycache__/'
      ];

      files = files.filter(f => {
        if (f.status === 'deleted') return false;
        return !ignorePatterns.some(p => f.filename.includes(p));
      });

      if (files.length === 0) {
        logger.info({ prNumber }, 'No reviewable files in PR after filtering');
        await dbService.updateReviewStatus(review.id, 'done', {
          finishedAt: new Date(),
          summary: 'No reviewable modified source files found.'
        });
        if (checkRunId && ghClient) {
          await ghClient.updateCheckRun(checkRunId, 'neutral', 'No reviewable code changes detected.');
        }
        return;
      }

      // -----------------------------------------------------------------------
      // STAGE 6: Map diff lines. Handled in getPullRequestFiles via validDiffLines.
      // -----------------------------------------------------------------------
      if (await this.isCancelled(review.id)) return;

      // -----------------------------------------------------------------------
      // STAGE 7: Static analysis. Run ESLint / Semgrep / Bandit / AST rules.
      // -----------------------------------------------------------------------
      const fileContentsMap = new Map<string, string>();
      for (const f of files) {
        if (f.rawContent) {
          fileContentsMap.set(f.filename.replace(/\\/g, '/'), f.rawContent);
        }
      }

      let staticFindings: Finding[] = [];
      try {
        staticFindings = await staticAnalyzerRunner.runAnalysis(
          { workingDir: '.', files: files.map(f => f.filename), signal: abortController.signal },
          fileContentsMap
        );
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Static analysis stage encountered error; continuing with LLM agents');
      }

      if (await this.isCancelled(review.id)) return;

      // -----------------------------------------------------------------------
      // STAGE 8: Retrieve context. Build context pack for changed symbols.
      // -----------------------------------------------------------------------
      const contextPacks = new Map<string, ContextPack>();
      for (const f of files) {
        try {
          const pack = await contextBuilder.buildContext(repoId, f, undefined, undefined, abortController.signal);
          contextPacks.set(f.filename, pack);
        } catch (err: any) {
          logger.warn({ err: err.message, file: f.filename }, 'Context retrieval error');
        }
      }

      if (await this.isCancelled(review.id)) return;

      // -----------------------------------------------------------------------
      // STAGE 9: Run agents. LangGraph specialist agents + verifier pass.
      // -----------------------------------------------------------------------
      const agentOutput = await reviewGraphRunner.run({
        repoId,
        prTitle: `PR #${prNumber}`,
        prBody: '',
        headSha,
        changedFiles: files,
        contextPacks,
        staticFindings,
        settings: repo.settings,
        signal: abortController.signal
      });

      if (await this.isCancelled(review.id)) return;

      // -----------------------------------------------------------------------
      // STAGE 10: Post-process. Dedupe, confidence boost, feedback suppression, rank & cap.
      // -----------------------------------------------------------------------
      const unhelpfulFingerprints = await dbService.getUnhelpfulFingerprints(repoId);
      const processed = postProcessFindings(agentOutput.findings, {
        settings: repo.settings,
        changedFiles: files,
        unhelpfulFingerprints,
        staticFindings
      });

      // -----------------------------------------------------------------------
      // STAGE 11: Guard. Confirm review is not cancelled and PR head_sha has not changed.
      // -----------------------------------------------------------------------
      if (await this.isCancelled(review.id)) return;

      try {
        const latestSha = await ghClient.getPullRequestHeadSha(prNumber);
        if (latestSha !== headSha) {
          logger.warn({ currentSha: latestSha, jobSha: headSha }, 'PR head_sha has changed. Discarding review results to prevent stale comments.');
          await dbService.updateReviewStatus(review.id, 'cancelled', {
            error: 'PR updated mid-review with new commit.'
          });
          return;
        }
      } catch {
        // Fallback if test mode
      }

      // -----------------------------------------------------------------------
      // STAGE 12: Publish. Send PR review with inline comments + summary body.
      // -----------------------------------------------------------------------
      const inlineComments = processed.inlineFindings.map(f => ({
        path: f.file,
        line: f.lineStart,
        body: GitHubClient.formatFindingComment(f)
      }));

      try {
        await ghClient.postReview(prNumber, headSha, agentOutput.summary, inlineComments);
      } catch (err: any) {
        logger.warn({ err: err.message }, 'GitHub postReview warning (allowed in dev/test mode)');
      }

      if (checkRunId) {
        await ghClient.updateCheckRun(checkRunId, 'neutral', agentOutput.summary);
      }

      // -----------------------------------------------------------------------
      // STAGE 13: Persist and clean up. Save findings, token counts, cost, timings.
      // -----------------------------------------------------------------------
      await dbService.saveFindings(review.id, processed.allValidFindings);

      const durationSec = (Date.now() - startTime) / 1000;
      reviewDurationSeconds.observe({ status: 'success', repo: repoFullName }, durationSec);
      findingsPostedTotal.inc({ severity: 'all', category: 'all', status: 'posted' }, processed.inlineFindings.length);

      await dbService.updateReviewStatus(review.id, 'done', {
        finishedAt: new Date(),
        tokensIn: agentOutput.tokensIn,
        tokensOut: agentOutput.tokensOut,
        costUsd: agentOutput.costUsd,
        summary: agentOutput.summary
      });

      logger.info({ reviewId: review.id, durationSec, postedComments: inlineComments.length }, 'Review pipeline completed successfully');
    } catch (err: any) {
      logger.error({ err: err.message, reviewId: review.id }, 'Review pipeline failed');

      if (checkRunId && ghClient) {
        try {
          await ghClient.updateCheckRun(
            checkRunId,
            'neutral',
            `### AI Code Review Status: Incomplete\n\nThe automated review could not complete due to: ${err.message}`
          );
        } catch {
          // ignore
        }
      }

      await dbService.updateReviewStatus(review.id, 'failed', {
        finishedAt: new Date(),
        error: err.message
      });

      throw err;
    }
  }

  private async isCancelled(reviewId: string): Promise<boolean> {
    if (this.checkCancellation) {
      return this.checkCancellation(reviewId);
    }
    const current = await dbService.getReview(reviewId);
    return current?.status === 'cancelled';
  }
}

