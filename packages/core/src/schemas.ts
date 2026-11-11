import { z } from 'zod';

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const CategorySchema = z.enum(['bug', 'security', 'quality', 'test']);

export const FindingSchema = z.object({
  file: z.string().min(1, 'File path is required'),
  lineStart: z.number().int().positive('lineStart must be a positive integer'),
  lineEnd: z.number().int().positive('lineEnd must be a positive integer'),
  severity: SeveritySchema,
  category: CategorySchema,
  title: z.string().min(3, 'Title is too short'),
  message: z.string().min(5, 'Message is too short'),
  evidence: z.string().min(1, 'Evidence is required'),
  suggestion: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export const FindingsListSchema = z.array(FindingSchema);

export const RepoSettingsSchema = z.object({
  confidenceThreshold: z.number().min(0).max(1).default(0.60),
  enabledAgents: z.array(CategorySchema).default(['bug', 'security', 'quality', 'test']),
  ignoreGlobs: z.array(z.string()).default([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
    '**/*.pyc',
    '**/__pycache__/**'
  ]),
  maxComments: z.number().int().positive().default(10),
  reviewDrafts: z.boolean().default(false),
  maxFileSizeKb: z.number().int().positive().default(200),
  languageOverrides: z.record(z.string()).optional()
});

export const ReviewJobSchema = z.object({
  installationId: z.number().int(),
  repoId: z.string(),
  repoFullName: z.string(),
  prNumber: z.number().int(),
  headSha: z.string(),
  baseSha: z.string(),
  deliveryId: z.string()
});

export const IndexJobSchema = z.object({
  installationId: z.number().int(),
  repoId: z.string(),
  repoFullName: z.string(),
  commitSha: z.string(),
  defaultBranch: z.string(),
  isIncremental: z.boolean(),
  lastIndexedSha: z.string().optional()
});

export const FeedbackInputSchema = z.object({
  findingId: z.string().uuid(),
  userLogin: z.string().min(1),
  value: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().optional()
});

export const GitHubWebhookHeadersSchema = z.object({
  'x-github-delivery': z.string().min(1),
  'x-github-event': z.string().min(1),
  'x-hub-signature-256': z.string().min(1)
});

export const PullRequestWebhookSchema = z.object({
  action: z.enum([
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'closed',
    'edited',
    'labeled',
    'unlabeled'
  ]).or(z.string()),
  number: z.number().int(),
  pull_request: z.object({
    number: z.number().int(),
    title: z.string().default(''),
    body: z.string().nullable().optional(),
    draft: z.boolean().optional().default(false),
    state: z.string(),
    user: z.object({
      login: z.string(),
      type: z.string().default('User')
    }),
    head: z.object({
      sha: z.string(),
      ref: z.string()
    }),
    base: z.object({
      sha: z.string(),
      ref: z.string()
    })
  }),
  repository: z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string(),
    default_branch: z.string().default('main'),
    owner: z.object({
      login: z.string()
    })
  }),
  installation: z.object({
    id: z.number().int()
  })
});

export const PushWebhookSchema = z.object({
  ref: z.string(),
  after: z.string(),
  before: z.string(),
  repository: z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string(),
    default_branch: z.string()
  }),
  installation: z.object({
    id: z.number().int()
  })
});

export const SyncInstallationSchema = z.object({
  installationId: z.coerce.number().int().positive({ message: 'installationId must be a positive integer' })
});

export const InstallationWebhookSchema = z.object({
  action: z.enum(['created', 'deleted', 'suspend', 'unsuspend']).or(z.string()),
  installation: z.object({
    id: z.number().int(),
    account: z.object({
      login: z.string(),
      type: z.string()
    }),
    suspended_at: z.string().nullable().optional()
  }),
  repositories: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string()
  })).optional()
});

export const InstallationRepositoriesWebhookSchema = z.object({
  action: z.enum(['added', 'removed']).or(z.string()),
  installation: z.object({
    id: z.number().int(),
    account: z.object({
      login: z.string(),
      type: z.string()
    }).optional()
  }),
  repositories_added: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string()
  })).optional().default([]),
  repositories_removed: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string()
  })).optional().default([])
});

export const PullRequestReviewThreadSchema = z.object({
  action: z.enum(['resolved', 'unresolved']).or(z.string()),
  thread: z.object({
    comments: z.array(z.object({
      id: z.number().int(),
      body: z.string(),
      user: z.object({ login: z.string() })
    }))
  }),
  repository: z.object({
    id: z.number().int(),
    full_name: z.string()
  })
});

