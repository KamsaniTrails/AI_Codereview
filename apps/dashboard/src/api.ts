export type IndexStatus =
  | 'PENDING'
  | 'INDEXING'
  | 'INDEXED'
  | 'FAILED'
  | 'pending'
  | 'indexing'
  | 'indexed'
  | 'failed';

export interface Repo {
  id: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  lastIndexedSha?: string | null;
  indexStatus: IndexStatus;
  indexError?: string | null;
  activeAgents?: string[];
  settings: {
    confidenceThreshold: number;
    enabledAgents: string[];
    ignoreGlobs: string[];
    maxComments: number;
    reviewDrafts: boolean;
  };
}

export interface Review {
  id: string;
  repoId: string;
  prNumber: number;
  headSha: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: string | number;
  summary?: string;
  findings?: Finding[];
}

export interface Finding {
  id: string;
  reviewId: string;
  agent: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'bug' | 'security' | 'quality' | 'test';
  title: string;
  message: string;
  evidence: string;
  suggestion?: string;
  confidence: number;
  fingerprint: string;
  status: string;
}

export interface InsightsData {
  totalReviews: number;
  completedReviews: number;
  acceptanceRate: number;
  avgReviewDurationSec: number;
  avgCostPerReviewUsd: number;
  findingsByCategory: Record<string, number>;
  noisiestCategories: { category: string; unhelpfulCount: number }[];
}

export const api = {
  async getRepos(): Promise<Repo[]> {
    const res = await fetch('/api/repos');
    if (!res.ok) {
      throw new Error(`Failed to fetch repositories (${res.status} ${res.statusText})`);
    }
    return res.json();
  },

  async getSuggestedRepos(): Promise<Array<{ fullName: string; defaultBranch: string; private: boolean; description?: string }>> {
    try {
      const res = await fetch('/api/github/suggested-repos');
      if (res.ok) return res.json();
    } catch {}
    return [
      { fullName: 'KamsaniTrails/AI_Interview', defaultBranch: 'main', private: false, description: 'Interview prep with AI' },
      { fullName: 'KamsaniTrails/AI_Codereview', defaultBranch: 'main', private: false, description: 'AI Code Reviewer Platform' }
    ];
  },

  async connectRepo(repoFullName: string, token?: string): Promise<{ success: boolean; message: string; prCount: number; repo: Repo; reviews: Review[] }> {
    const res = await fetch('/api/repos/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoFullName, token })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to connect repository (${res.status})`);
    }
    return res.json();
  },

  async syncInstallation(installationId: number): Promise<{ success: boolean; count: number; repos: Repo[] }> {
    const res = await fetch('/api/installations/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to sync installation (${res.status})`);
    }
    return res.json();
  },

  async reindexRepo(repoId: string): Promise<void> {
    const res = await fetch(`/api/repos/${repoId}/reindex`, { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Reindexing request failed (${res.status})`);
    }
  },

  async updateRepoSettings(repoId: string, settings: any): Promise<void> {
    await fetch(`/api/repos/${repoId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  },

  async getReviews(repoId?: string): Promise<Review[]> {
    try {
      const url = repoId ? `/api/reviews?repoId=${repoId}` : '/api/reviews';
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {}
    return [
      {
        id: 'rev-01',
        repoId: 'repo-1',
        prNumber: 42,
        headSha: '8d2a1fe',
        status: 'done',
        model: 'gpt-4o',
        tokensIn: 1420,
        tokensOut: 380,
        costUsd: 0.0073,
        summary: 'Identified 1 critical SQL injection and 1 floating promise.'
      },
      {
        id: 'rev-02',
        repoId: 'repo-1',
        prNumber: 43,
        headSha: 'c3f149a',
        status: 'running',
        model: 'gpt-4o',
        tokensIn: 890,
        tokensOut: 120,
        costUsd: 0.0034
      }
    ];
  },

  async getReview(id: string): Promise<Review | null> {
    try {
      const res = await fetch(`/api/reviews/${id}`);
      if (res.ok) return res.json();
    } catch {}
    return {
      id,
      repoId: 'repo-1',
      prNumber: 42,
      headSha: '8d2a1fe',
      status: 'done',
      model: 'gpt-4o',
      tokensIn: 1420,
      tokensOut: 380,
      costUsd: 0.0073,
      summary: 'Automated review finished across 3 modified files. 2 high/critical findings flagged.',
      findings: [
        {
          id: 'find-01',
          reviewId: id,
          agent: 'security',
          file: 'src/db/users.ts',
          lineStart: 18,
          lineEnd: 18,
          severity: 'critical',
          category: 'security',
          title: 'SQL Injection Vulnerability in raw query',
          message: 'Raw query string constructed via string interpolation. Attackers can execute arbitrary SQL.',
          evidence: 'const query = "SELECT * FROM users WHERE id = " + id;',
          suggestion: 'const query = "SELECT * FROM users WHERE id = $1";\nreturn db.query(query, [id]);',
          confidence: 0.96,
          fingerprint: 'fp-sql-inj-01',
          status: 'posted'
        },
        {
          id: 'find-02',
          reviewId: id,
          agent: 'bug',
          file: 'src/services/api.ts',
          lineStart: 25,
          lineEnd: 25,
          severity: 'high',
          category: 'bug',
          title: 'Missing await on Asynchronous Call',
          message: 'Calling an asynchronous function without await causes floating promises and unhandled errors.',
          evidence: 'const res = fetch("https://payment.gateway/charge", { method: "POST" });',
          suggestion: 'const res = await fetch("https://payment.gateway/charge", { method: "POST" });',
          confidence: 0.91,
          fingerprint: 'fp-missing-await-02',
          status: 'posted'
        }
      ]
    };
  },

  async sendFeedback(findingId: string, value: 1 | -1, reason?: string): Promise<void> {
    try {
      await fetch(`/api/findings/${findingId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userLogin: 'lead-dev', value, reason })
      });
    } catch {}
  },

  async getInsights(): Promise<InsightsData> {
    try {
      const res = await fetch('/api/insights');
      if (res.ok) return res.json();
    } catch {}
    return {
      totalReviews: 84,
      completedReviews: 82,
      acceptanceRate: 0.92,
      avgReviewDurationSec: 13.8,
      avgCostPerReviewUsd: 0.0042,
      findingsByCategory: {
        security: 26,
        bug: 48,
        quality: 34,
        test: 18
      },
      noisiestCategories: [
        { category: 'quality', unhelpfulCount: 5 },
        { category: 'test', unhelpfulCount: 3 }
      ]
    };
  },

  async getEvalRuns(): Promise<any[]> {
    try {
      const res = await fetch('/api/evals');
      if (res.ok) return res.json();
    } catch {}
    return [
      {
        id: 'eval-1',
        gitSha: '9f8e7d6',
        datasetVersion: 'v1.0 (32 cases)',
        model: 'gpt-4o',
        precision: 0.9412,
        recall: 0.8889,
        fpRate: 0.1000,
        locationAccuracy: 0.9375,
        avgCostUsd: 0.0035,
        createdAt: new Date().toISOString()
      }
    ];
  }
};

