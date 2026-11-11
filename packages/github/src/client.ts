import { Octokit } from '@octokit/rest';
import {
  logger,
  githubRateLimitRemaining,
  type ChangedFile,
  type Finding
} from '@ai-reviewer/core';
import { parsePatch } from './diff.js';

export interface PostReviewComment {
  path: string;
  line: number;
  body: string;
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'ai-code-reviewer-app/1.0.0'
    });
  }

  private updateRateLimitMetrics(headers: Record<string, any>) {
    const remaining = headers['x-ratelimit-remaining'];
    if (remaining !== undefined) {
      const val = parseInt(String(remaining), 10);
      if (!isNaN(val)) {
        githubRateLimitRemaining.set(val);
      }
    }
  }

  /**
   * Fetches all changed files for a pull request, handles pagination,
   * and computes valid right-side line sets.
   */
  public async getPullRequestFiles(prNumber: number, signal?: AbortSignal): Promise<ChangedFile[]> {
    logger.info({ prNumber, repo: `${this.owner}/${this.repo}` }, 'Fetching PR files');
    const files: ChangedFile[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      const res = await this.octokit.rest.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        per_page: perPage,
        page
      });

      this.updateRateLimitMetrics(res.headers);

      for (const item of res.data) {
        const parsed = parsePatch(item.patch);
        files.push({
          filename: item.filename,
          status: item.status as ChangedFile['status'],
          additions: item.additions,
          deletions: item.deletions,
          changes: item.changes,
          patch: item.patch,
          validDiffLines: parsed.validRightLines
        });
      }

      if (res.data.length < perPage) {
        break;
      }
      page++;
    }

    return files;
  }

  /**
   * Fetches raw content of a file at a specific commit SHA.
   */
  public async getFileContent(filePath: string, ref: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    try {
      const res = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        ref,
        headers: {
          accept: 'application/vnd.github.raw'
        }
      });
      this.updateRateLimitMetrics(res.headers);

      if (typeof res.data === 'string') {
        return res.data;
      }
      // If base64 encoded
      if (typeof res.data === 'object' && res.data !== null && 'content' in res.data) {
        const content = (res.data as any).content || '';
        return Buffer.from(content, 'base64').toString('utf-8');
      }
      return '';
    } catch (err: any) {
      logger.warn({ err: err.message, filePath, ref }, 'Failed to fetch raw file content');
      return '';
    }
  }

  /**
   * Fetches PR details to confirm current head SHA has not changed (preventing stale comments).
   */
  public async getPullRequestHeadSha(prNumber: number): Promise<string> {
    const res = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
    this.updateRateLimitMetrics(res.headers);
    return res.data.head.sha;
  }

  /**
   * Creates a Check Run titled 'AI Code Review' in status 'in_progress'.
   */
  public async createCheckRun(headSha: string, checkName = 'AI Code Review'): Promise<number> {
    const res = await this.octokit.rest.checks.create({
      owner: this.owner,
      repo: this.repo,
      name: checkName,
      head_sha: headSha,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      output: {
        title: 'AI Code Review in Progress',
        summary: 'Analyzing modified files with static analysis and specialist agents...'
      }
    });
    this.updateRateLimitMetrics(res.headers);
    return res.data.id;
  }

  /**
   * Completes a Check Run with 'neutral' conclusion (never blocks merge in v1) and markdown report.
   */
  public async updateCheckRun(
    checkRunId: number,
    conclusion: 'neutral' | 'success' | 'failure' = 'neutral',
    summaryMarkdown: string,
    title = 'AI Code Review Completed'
  ): Promise<void> {
    const res = await this.octokit.rest.checks.update({
      owner: this.owner,
      repo: this.repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title,
        summary: summaryMarkdown
      }
    });
    this.updateRateLimitMetrics(res.headers);
  }

  /**
   * Formats a finding into GitHub inline comment markdown with optional suggestion block.
   */
  public static formatFindingComment(finding: Finding): string {
    const severityBadges: Record<string, string> = {
      critical: '🔴 **CRITICAL**',
      high: '🟠 **HIGH**',
      medium: '🟡 **MEDIUM**',
      low: '🔵 **LOW**',
      info: 'ℹ️ **INFO**'
    };

    const badge = severityBadges[finding.severity] || finding.severity.toUpperCase();

    let body = `### ${badge}: ${finding.title}\n\n`;
    body += `${finding.message}\n\n`;

    if (finding.evidence) {
      body += `**Evidence / Trigger:**\n> ${finding.evidence.replace(/\n/g, '\n> ')}\n\n`;
    }

    if (finding.suggestion) {
      body += `**Suggested fix:**\n\`\`\`suggestion\n${finding.suggestion}\n\`\`\`\n\n`;
    }

    body += `*Confidence: ${(finding.confidence * 100).toFixed(0)}% | Agent: \`${finding.agent}\` | Fingerprint: \`${finding.fingerprint?.slice(0, 8) || 'n/a'}\`*`;
    return body;
  }

  /**
   * Posts a single PR review containing all inline comments and a summary body.
   */
  public async postReview(
    prNumber: number,
    commitSha: string,
    summaryBody: string,
    comments: PostReviewComment[]
  ): Promise<{ reviewId: number }> {
    logger.info({ prNumber, commentsCount: comments.length }, 'Submitting PR review to GitHub');

    const res = await this.octokit.rest.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      commit_id: commitSha,
      body: summaryBody,
      event: 'COMMENT',
      comments: comments.map(c => ({
        path: c.path,
        line: c.line,
        body: c.body
      }))
    });

    this.updateRateLimitMetrics(res.headers);
    return { reviewId: res.data.id };
  }
}

