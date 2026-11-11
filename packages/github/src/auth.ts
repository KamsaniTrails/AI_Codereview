import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import { getConfig, logger } from '@ai-reviewer/core';

export interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in ms
}

export class GitHubAuthService {
  private appId: string;
  private privateKey: string;
  private tokenCache = new Map<number, CachedToken>();

  constructor(appId?: string, privateKeyOrBase64?: string) {
    const config = getConfig();
    this.appId = appId || config.GITHUB_APP_ID;
    const rawKey = privateKeyOrBase64 || config.GITHUB_PRIVATE_KEY || config.GITHUB_PRIVATE_KEY_BASE64;

    if (rawKey) {
      if (rawKey.includes('-----BEGIN')) {
        this.privateKey = rawKey;
      } else {
        try {
          this.privateKey = Buffer.from(rawKey, 'base64').toString('utf-8');
        } catch {
          this.privateKey = rawKey;
        }
      }
    } else {
      this.privateKey = '';
    }
  }

  /**
   * Generates a signed GitHub App JWT using RS256.
   * iss: App ID
   * iat: now - 60s (clock drift leeway)
   * exp: now + 10m (GitHub max allowed lifetime)
   */
  public generateAppJwt(): string {
    if (!this.privateKey) {
      return `mock-app-jwt-for-${this.appId}`;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60,
      exp: now + (10 * 60),
      iss: this.appId
    };

    return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
  }

  /**
   * Retrieves an installation access token.
   * Reuses cached token if valid for at least 5 more minutes.
   */
  public async getInstallationToken(
    installationId: number,
    fetcher?: (jwt: string) => Promise<{ token: string; expiresAt: string }>
  ): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (cached && (cached.expiresAt - now) > fiveMinutes) {
      return cached.token;
    }

    logger.info({ installationId }, 'Refreshing installation access token');

    if (fetcher) {
      const appJwt = this.generateAppJwt();
      const res = await fetcher(appJwt);
      const expiresAtMs = new Date(res.expiresAt).getTime();
      this.tokenCache.set(installationId, {
        token: res.token,
        expiresAt: expiresAtMs
      });
      return res.token;
    }

    // Default fetch using standard HTTPS if fetcher not provided
    if (!this.privateKey) {
      const mockToken = `mock-installation-token-${installationId}`;
      this.tokenCache.set(installationId, {
        token: mockToken,
        expiresAt: now + (3600 * 1000)
      });
      return mockToken;
    }

    const appJwt = this.generateAppJwt();
    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${appJwt}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get installation token (${response.status}): ${text}`);
    }

    const data = await response.json() as { token: string; expires_at: string };
    const expiresAtMs = new Date(data.expires_at).getTime();

    this.tokenCache.set(installationId, {
      token: data.token,
      expiresAt: expiresAtMs
    });

    return data.token;
  }

  public clearCache(): void {
    this.tokenCache.clear();
  }
}

let defaultAuthService: GitHubAuthService | null = null;

export function getGitHubAuthService(config?: { appId?: string; privateKey?: string }): GitHubAuthService {
  if (config) {
    return new GitHubAuthService(config.appId, config.privateKey);
  }
  if (!defaultAuthService) {
    defaultAuthService = new GitHubAuthService();
  }
  return defaultAuthService;
}

/**
 * Builds an Octokit client authenticated as the GitHub App using JWT auth.
 */
export function getAppOctokit(config?: { appId?: string; privateKey?: string }): Octokit {
  const service = getGitHubAuthService(config);
  const jwt = service.generateAppJwt();
  return new Octokit({
    auth: jwt,
    userAgent: 'ai-code-reviewer-app/1.0.0'
  });
}

/**
 * Returns an installation-authenticated Octokit client for the given installation ID.
 */
export async function getInstallationOctokit(
  installationId: number,
  config?: { appId?: string; privateKey?: string }
): Promise<Octokit> {
  const service = getGitHubAuthService(config);
  const token = await service.getInstallationToken(installationId);
  return new Octokit({
    auth: token,
    userAgent: 'ai-code-reviewer-app/1.0.0'
  });
}

