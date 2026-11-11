import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DASHBOARD_PORT: z.coerce.number().int().default(5173),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/ai_code_reviewer'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  GITHUB_APP_ID: z.string().default('123456'),
  GITHUB_APP_SLUG: z.string().default('ai-code-reviewer-app'),
  GITHUB_PRIVATE_KEY_BASE64: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().default('development_webhook_secret_key_123456789'),
  GITHUB_CLIENT_ID: z.string().default('mock_client_id'),
  GITHUB_CLIENT_SECRET: z.string().default('mock_client_secret'),
  SESSION_SECRET: z.string().default('super-secret-session-key-change-in-production-12345'),
  LLM_PROVIDER: z.enum(['openai', 'gemini', 'anthropic', 'mock']).default('mock'),
  LLM_MODEL: z.string().default('gpt-4o'),
  EMBEDDING_PROVIDER: z.enum(['openai', 'mock']).default('mock'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSION: z.coerce.number().int().default(1536),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DASHBOARD_URL: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | null = null;

export function loadConfig(envOverrides?: Partial<Record<string, string>>): AppConfig {
  if (cachedConfig && !envOverrides) {
    return cachedConfig;
  }
  const rawEnv = { ...process.env, ...envOverrides };
  const parsed = ConfigSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const formatted = parsed.error.format();
    throw new Error(`[Config Error] Invalid environment configuration: ${JSON.stringify(formatted, null, 2)}`);
  }

  if (!envOverrides) {
    cachedConfig = parsed.data;
  }
  return parsed.data;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

