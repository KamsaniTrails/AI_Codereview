import fs from 'node:fs/promises';
import path from 'node:path';
import type { EvalCase } from '@ai-reviewer/core';

export const BENCHMARK_CASES: EvalCase[] = [
  // --- Category 1: Real Bug Fixes (1-12) ---
  {
    id: 'case-01-sql-injection',
    title: 'SQL injection in user query handler',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/ecommerce-api',
    baseCommit: 'base-01',
    headCommit: 'head-01',
    diff: `diff --git a/src/db/users.ts b/src/db/users.ts
--- a/src/db/users.ts
+++ b/src/db/users.ts
@@ -15,4 +15,5 @@ export async function findUser(id: string) {
-  return db.query("SELECT * FROM users WHERE id = " + id);
+  const query = "SELECT * FROM users WHERE id = " + id;
+  return db.query(query);
 }`,
    files: [
      {
        path: 'src/db/users.ts',
        content: `export async function findUser(id: string) {\n  const query = "SELECT * FROM users WHERE id = " + id;\n  return db.query(query);\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/db/users.ts',
        lineRange: [1, 4],
        category: 'security',
        severity: 'critical',
        description: 'Raw SQL query string concatenation allows SQL injection'
      }
    ]
  },
  {
    id: 'case-02-auth-timing-leak',
    title: 'Timing attack in password verification',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/auth-service',
    baseCommit: 'base-02',
    headCommit: 'head-02',
    diff: `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -40,4 +40,5 @@ export function verifyToken(password: string, entered: string) {
+  if (password === entered) {
+    return true;
+  }
+  return false;
 }`,
    files: [
      {
        path: 'src/auth/login.ts',
        content: `export function verifyToken(password: string, entered: string) {\n  if (password === entered) {\n    return true;\n  }\n  return false;\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/auth/login.ts',
        lineRange: [1, 5],
        category: 'security',
        severity: 'high',
        description: 'Plain equality check on secret tokens leaks timing information'
      }
    ]
  },
  {
    id: 'case-03-null-dereference',
    title: 'Null pointer dereference on user profile',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/profile-api',
    baseCommit: 'base-03',
    headCommit: 'head-03',
    diff: `diff --git a/src/routes/profile.ts b/src/routes/profile.ts
--- a/src/routes/profile.ts
+++ b/src/routes/profile.ts
@@ -28,4 +28,4 @@ export function getUserEmail(user: any) {
+  return user.profile.email;
 }`,
    files: [
      {
        path: 'src/routes/profile.ts',
        content: `export function getUserEmail(user: any) {\n  return user.profile.email;\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/routes/profile.ts',
        lineRange: [1, 3],
        category: 'bug',
        severity: 'high',
        description: 'Unchecked nested property access causes runtime TypeError'
      }
    ]
  },
  {
    id: 'case-04-missing-await',
    title: 'Missing await on asynchronous fetch',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/billing',
    baseCommit: 'base-04',
    headCommit: 'head-04',
    diff: `diff --git a/src/services/api.ts b/src/services/api.ts
--- a/src/services/api.ts
+++ b/src/services/api.ts
@@ -20,4 +20,6 @@ export async function chargeCard(userId: string) {
+  const res = fetch("https://payment.gateway/charge", { method: "POST" });
+  return res;
 }`,
    files: [
      {
        path: 'src/services/api.ts',
        content: `export async function chargeCard(userId: string) {\n  const res = fetch("https://payment.gateway/charge", { method: "POST" });\n  return res;\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/services/api.ts',
        lineRange: [1, 4],
        category: 'bug',
        severity: 'high',
        description: 'Asynchronous fetch called without await in async function'
      }
    ]
  },
  {
    id: 'case-05-hardcoded-secret',
    title: 'Hardcoded API secret token in production client',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/cloud-tools',
    baseCommit: 'base-05',
    headCommit: 'head-05',
    diff: `diff --git a/src/config/keys.ts b/src/config/keys.ts
--- a/src/config/keys.ts
+++ b/src/config/keys.ts
@@ -5,4 +5,5 @@ export const CONFIG = {
+  api_key: "mock_token_99887766554433221100"
 };`,
    files: [
      {
        path: 'src/config/keys.ts',
        content: `export const CONFIG = {\n  api_key: "mock_token_99887766554433221100"\n};`
      }
    ],
    expectedFindings: [
      {
        file: 'src/config/keys.ts',
        lineRange: [1, 3],
        category: 'security',
        severity: 'critical',
        description: 'Hardcoded secret token committed to repository'
      }
    ]
  },
  {
    id: 'case-06-off-by-one',
    title: 'Off-by-one loop boundary on array',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/analytics',
    baseCommit: 'base-06',
    headCommit: 'head-06',
    diff: `diff --git a/src/utils/array.ts b/src/utils/array.ts
--- a/src/utils/array.ts
+++ b/src/utils/array.ts
@@ -10,4 +10,6 @@ export function printItems(items: string[]) {
+  for (let i = 0; i <= items.length; i++) {
+    console.log(items[i]);
+  }
 }`,
    files: [
      {
        path: 'src/utils/array.ts',
        content: `export function printItems(items: string[]) {\n  for (let i = 0; i <= items.length; i++) {\n    console.log(items[i]);\n  }\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/utils/array.ts',
        lineRange: [1, 5],
        category: 'bug',
        severity: 'medium',
        description: 'Using <= on array length reads past end of array'
      }
    ]
  },
  {
    id: 'case-07-arbitrary-eval',
    title: 'Direct call to eval() with external input',
    type: 'real_bug',
    language: 'javascript',
    repo: 'acme/script-runner',
    baseCommit: 'base-07',
    headCommit: 'head-07',
    diff: `diff --git a/src/runner.js b/src/runner.js
--- a/src/runner.js
+++ b/src/runner.js
@@ -1,3 +1,5 @@
+function executeDynamicFormula(formula) {
+  return eval(formula);
+}
`,
    files: [
      {
        path: 'src/runner.js',
        content: `function executeDynamicFormula(formula) {\n  return eval(formula);\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/runner.js',
        lineRange: [1, 3],
        category: 'security',
        severity: 'critical',
        description: 'eval() enables arbitrary remote code execution'
      }
    ]
  },
  {
    id: 'case-08-insecure-random',
    title: 'Using Math.random() to generate session token',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/session-manager',
    baseCommit: 'base-08',
    headCommit: 'head-08',
    diff: `diff --git a/src/token.ts b/src/token.ts
--- a/src/token.ts
+++ b/src/token.ts
@@ -1,3 +1,5 @@
+export function generateSessionToken() {
+  return "token_" + Math.random();
+}
`,
    files: [
      {
        path: 'src/token.ts',
        content: `export function generateSessionToken() {\n  return "token_" + Math.random();\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/token.ts',
        lineRange: [1, 3],
        category: 'security',
        severity: 'medium',
        description: 'Math.random() is cryptographically predictable'
      }
    ]
  },
  {
    id: 'case-09-py-sql-injection',
    title: 'Python raw f-string SQL query',
    type: 'real_bug',
    language: 'python',
    repo: 'acme/django-backend',
    baseCommit: 'base-09',
    headCommit: 'head-09',
    diff: `diff --git a/services/database.py b/services/database.py
--- a/services/database.py
+++ b/services/database.py
@@ -1,3 +1,5 @@
+def fetch_account(account_id):
+    cursor.execute(f"SELECT * FROM accounts WHERE id = {account_id}")
`,
    files: [
      {
        path: 'services/database.py',
        content: `def fetch_account(account_id):\n    cursor.execute(f"SELECT * FROM accounts WHERE id = {account_id}")\n`
      }
    ],
    expectedFindings: [
      {
        file: 'services/database.py',
        lineRange: [1, 3],
        category: 'security',
        severity: 'critical',
        description: 'f-string SQL query allows SQL injection'
      }
    ]
  },
  {
    id: 'case-10-py-hardcoded-secret',
    title: 'Python hardcoded API secret in settings',
    type: 'real_bug',
    language: 'python',
    repo: 'acme/py-gateway',
    baseCommit: 'base-10',
    headCommit: 'head-10',
    diff: `diff --git a/config/settings.py b/config/settings.py
--- a/config/settings.py
+++ b/config/settings.py
@@ -1,3 +1,4 @@
+SECRET_KEY = "mock_token_99887766554433221100"
`,
    files: [
      {
        path: 'config/settings.py',
        content: `SECRET_KEY = "mock_token_99887766554433221100"\n`
      }
    ],
    expectedFindings: [
      {
        file: 'config/settings.py',
        lineRange: [1, 2],
        category: 'security',
        severity: 'critical',
        description: 'Hardcoded secret in settings file'
      }
    ]
  },
  {
    id: 'case-11-missing-unit-test',
    title: 'New critical calculation added without test coverage',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/tax-calculator',
    baseCommit: 'base-11',
    headCommit: 'head-11',
    diff: `diff --git a/src/math/calc.ts b/src/math/calc.ts
--- a/src/math/calc.ts
+++ b/src/math/calc.ts
@@ -1,3 +1,6 @@
+export function calculateCompoundTax(principal: number, rate: number, years: number) {
+  return principal * Math.pow(1 + rate, years) - principal;
+}
`,
    files: [
      {
        path: 'src/math/calc.ts',
        content: `export function calculateCompoundTax(principal: number, rate: number, years: number) {\n  return principal * Math.pow(1 + rate, years) - principal;\n}\n`
      }
    ],
    expectedFindings: [
      {
        file: 'src/math/calc.ts',
        lineRange: [1, 4],
        category: 'test',
        severity: 'medium',
        description: 'Critical business calculation lacks test coverage'
      }
    ]
  },
  {
    id: 'case-12-unhandled-promise-rejection',
    title: 'Async promise left floating without catch or await',
    type: 'real_bug',
    language: 'typescript',
    repo: 'acme/notification-service',
    baseCommit: 'base-12',
    headCommit: 'head-12',
    diff: `diff --git a/src/notify.ts b/src/notify.ts
--- a/src/notify.ts
+++ b/src/notify.ts
@@ -5,4 +5,6 @@ export function sendNotification(email: string) {
+  fetch("https://mailer/send", { method: "POST" });
+  return { status: "queued" };
 }`,
    files: [
      {
        path: 'src/notify.ts',
        content: `export function sendNotification(email: string) {\n  fetch("https://mailer/send", { method: "POST" });\n  return { status: "queued" };\n}`
      }
    ],
    expectedFindings: [
      {
        file: 'src/notify.ts',
        lineRange: [1, 4],
        category: 'bug',
        severity: 'high',
        description: 'Unhandled floating promise will cause unhandled rejections'
      }
    ]
  },

  // --- Category 2: Injected Bugs (13-22) ---
  ...Array.from({ length: 10 }).map((_, idx) => {
    const num = 13 + idx;
    return {
      id: `case-${num}-injected-issue`,
      title: `Injected bug #${idx + 1}: authentication and boundary condition check`,
      type: 'injected_bug' as const,
      language: (idx % 2 === 0 ? 'typescript' : 'python') as any,
      repo: 'acme/microservice',
      baseCommit: `base-${num}`,
      headCommit: `head-${num}`,
      diff: idx % 2 === 0
        ? `diff --git a/src/auth/login.ts b/src/auth/login.ts\n--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -42,3 +42,3 @@\n+ password === input\n`
        : `diff --git a/src/db/users.ts b/src/db/users.ts\n--- a/src/db/users.ts\n+++ b/src/db/users.ts\n@@ -18,3 +18,3 @@\n+ const query = "SELECT * FROM users WHERE id = " + id;\n`,
      files: [
        {
          path: idx % 2 === 0 ? 'src/auth/login.ts' : 'src/db/users.ts',
          content: idx % 2 === 0
            ? 'export function verify(password: string, input: string) {\n  return password === input;\n}'
            : 'export function findUser(id: string) {\n  const query = "SELECT * FROM users WHERE id = " + id;\n  return db.query(query);\n}'
        }
      ],
      expectedFindings: [
        {
          file: idx % 2 === 0 ? 'src/auth/login.ts' : 'src/db/users.ts',
          lineRange: [1, 4] as [number, number],
          category: 'security' as const,
          severity: 'high' as const,
          description: 'Injected security boundary vulnerability'
        }
      ]
    };
  }),

  // --- Category 3: Clean PRs - No Bugs (23-32) ---
  ...Array.from({ length: 10 }).map((_, idx) => {
    const num = 23 + idx;
    return {
      id: `case-${num}-clean-pr`,
      title: `Clean PR #${idx + 1}: refactor helper functions and add documentation`,
      type: 'clean_pr' as const,
      language: 'typescript' as const,
      repo: 'acme/clean-utils',
      baseCommit: `base-${num}`,
      headCommit: `head-${num}`,
      diff: `diff --git a/src/helpers/string.ts b/src/helpers/string.ts
--- a/src/helpers/string.ts
+++ b/src/helpers/string.ts
@@ -1,4 +1,7 @@
+/**
+ * Safely capitalizes the first letter of a non-empty string.
+ */
 export function capitalize(str: string): string {
-  return str.toUpperCase();
+  if (!str) return '';
+  return str.charAt(0).toUpperCase() + str.slice(1);
 }`,
      files: [
        {
          path: 'src/helpers/string.ts',
          content: `/**\n * Safely capitalizes the first letter of a non-empty string.\n */\nexport function capitalize(str: string): string {\n  if (!str) return '';\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}`
        }
      ],
      expectedFindings: [] // Zero expected findings! Used to measure false positive rate.
    };
  })
];

export async function writeBenchmarkDatasetToDisk(targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  for (const item of BENCHMARK_CASES) {
    const filePath = path.join(targetDir, `${item.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(item, null, 2), 'utf-8');
  }
}

