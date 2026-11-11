import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts']
  },
  resolve: {
    alias: {
      '@ai-reviewer/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@ai-reviewer/github': path.resolve(__dirname, 'packages/github/src/index.ts'),
      '@ai-reviewer/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
      '@ai-reviewer/llm': path.resolve(__dirname, 'packages/llm/src/index.ts'),
      '@ai-reviewer/analyzers': path.resolve(__dirname, 'packages/analyzers/src/index.ts'),
      '@ai-reviewer/indexer': path.resolve(__dirname, 'packages/indexer/src/index.ts'),
      '@ai-reviewer/retrieval': path.resolve(__dirname, 'packages/retrieval/src/index.ts'),
      '@ai-reviewer/agents': path.resolve(__dirname, 'packages/agents/src/index.ts')
    }
  }
});

