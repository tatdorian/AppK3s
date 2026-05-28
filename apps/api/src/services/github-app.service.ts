/**
 * GitHub App Service
 * Handles JWT signing, installation tokens, repo/branch listing.
 * Uses RSA-SHA256 (RS256) for GitHub App JWT — no external JWT lib needed.
 */
import * as crypto from 'crypto';
import * as path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { config } from '../config.js';
import type { GitRepo, GitBranch, DetectedBuild } from '@appk3s/shared';

// ── Encryption (reuses same key as git-source tokens) ────────────────────────

const ALGO = 'aes-256-gcm';

function getEncKey(): Buffer {
  const raw = config.encryptionKey ?? 'default-key-change-me-in-production!';
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptValue(value: string): string {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptValue(enc: string): string {
  if (!enc.includes(':')) return enc; // plain-text fallback
  const key = getEncKey();
  const [ivHex, tagHex, dataHex] = enc.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

// ── RS256 JWT for GitHub App auth ─────────────────────────────────────────────

function signAppJwt(appId: number, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iat: now - 60,  // issued 60s ago to handle clock skew
    exp: now + 540, // expires in 9 min (max is 10 min)
    iss: appId,
  })).toString('base64url');
  const toSign = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const signature = sign.sign(privateKeyPem, 'base64url');
  return `${toSign}.${signature}`;
}

// ── GitHub App API (authenticated as the App itself) ─────────────────────────

export class GitHubAppApi {
  constructor(private appId: number, private privateKeyPem: string) {}

  private get jwt(): string {
    return signAppJwt(this.appId, this.privateKeyPem);
  }

  private async fetch(endpoint: string, opts?: RequestInit): Promise<any> {
    const res = await fetch(`https://api.github.com${endpoint}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AppK3s/1.0',
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub App API ${endpoint} → HTTP ${res.status}: ${body}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /** Get an installation access token (expires in 1h). */
  async getInstallationToken(installationId: number): Promise<{ token: string; expiresAt: string }> {
    const data = await this.fetch(`/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return { token: data.token, expiresAt: data.expires_at };
  }

  /** List all installations of this app. */
  async listInstallations(): Promise<any[]> {
    return this.fetch('/app/installations?per_page=100') as Promise<any[]>;
  }

  /** Get a single installation. */
  async getInstallation(installationId: number): Promise<any> {
    return this.fetch(`/app/installations/${installationId}`);
  }

  /** Delete (uninstall) an installation. */
  async deleteInstallation(installationId: number): Promise<void> {
    await this.fetch(`/app/installations/${installationId}`, { method: 'DELETE' });
  }
}

// ── GitHub Installation API (authenticated as the Installation) ───────────────

export class GitHubInstallationApi {
  constructor(private token: string) {}

  private async fetch(endpoint: string, opts?: RequestInit): Promise<any> {
    const res = await fetch(`https://api.github.com${endpoint}`, {
      ...opts,
      headers: {
        Authorization: `token ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AppK3s/1.0',
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub Installation API ${endpoint} → HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }

  /** List all repos accessible via this installation. */
  async listRepos(): Promise<GitRepo[]> {
    const data = await this.fetch('/installation/repositories?per_page=100') as any;
    return (data.repositories ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      private: r.private,
      url: r.clone_url,
      defaultBranch: r.default_branch,
      updatedAt: r.updated_at,
    }));
  }

  /** List branches for a repo. */
  async listBranches(owner: string, repo: string): Promise<GitBranch[]> {
    const raw = await this.fetch(`/repos/${owner}/${repo}/branches?per_page=100`) as any[];
    return raw.map((b: any) => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected,
    }));
  }

  /** Detect build type by inspecting the root tree. */
  async detectBuild(owner: string, repo: string, branch: string): Promise<DetectedBuild> {
    try {
      const tree = await this.fetch(
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=0`,
      ) as any;
      const files: string[] = tree.tree
        .filter((i: any) => i.type === 'blob')
        .map((i: any) => path.basename(i.path));
      return buildDetectionFromFileList(files);
    } catch {
      return { buildType: 'nixpacks', confidence: 'low', hasDockerfile: false, hasDockerCompose: false };
    }
  }
}

// ── Build detection (shared logic) ───────────────────────────────────────────

function buildDetectionFromFileList(files: string[]): DetectedBuild {
  const hasDockerfile = files.some((f) => /^dockerfile$/i.test(f));
  const hasDockerCompose = files.some((f) => /^docker-compose\.ya?ml$/i.test(f));

  const langChecks = [
    { files: ['package.json'], lang: 'node' },
    { files: ['requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py'], lang: 'python' },
    { files: ['go.mod'], lang: 'go' },
    { files: ['Cargo.toml'], lang: 'rust' },
    { files: ['Gemfile'], lang: 'ruby' },
    { files: ['composer.json'], lang: 'php' },
    { files: ['pom.xml', 'build.gradle', 'gradlew'], lang: 'java' },
    { files: ['mix.exs'], lang: 'elixir' },
    { files: ['pubspec.yaml'], lang: 'dart' },
  ];

  let nixpacksLanguage: string | undefined;
  for (const check of langChecks) {
    if (check.files.some((f) => files.includes(f))) {
      nixpacksLanguage = check.lang;
      break;
    }
  }

  if (hasDockerfile) return { buildType: 'dockerfile', confidence: 'high', hasDockerfile, hasDockerCompose };
  if (hasDockerCompose) return { buildType: 'docker-compose', confidence: 'high', hasDockerfile, hasDockerCompose };
  if (nixpacksLanguage) return { buildType: 'nixpacks', language: nixpacksLanguage, confidence: 'high', hasDockerfile, hasDockerCompose, nixpacksLanguage };
  if (files.includes('index.html')) return { buildType: 'static', confidence: 'high', hasDockerfile, hasDockerCompose };
  return { buildType: 'nixpacks', confidence: 'low', hasDockerfile, hasDockerCompose };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export interface DbGithubApp {
  id: string;
  appId: number;
  slug: string;
  name: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  privateKey: string;
  htmlUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get the GitHub App config from DB.
 * - If userId is provided → returns that user's app (per-user mode).
 * - Without userId → returns any available app (used for OAuth login flow).
 */
export async function getGithubApp(userId?: string): Promise<DbGithubApp | null> {
  const rows = userId
    ? await db.execute(sql`SELECT * FROM github_app WHERE user_id = ${userId} LIMIT 1`)
    : await db.execute(sql`SELECT * FROM github_app LIMIT 1`);
  if (!(rows as any).rows || (rows as any).rows.length === 0) return null;
  const r = (rows as any).rows[0];
  return {
    id: r.id,
    appId: Number(r.app_id),
    slug: r.slug,
    name: r.name,
    clientId: r.client_id,
    clientSecret: r.client_secret,
    webhookSecret: r.webhook_secret,
    privateKey: r.private_key,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Instantiate a GitHubAppApi for a specific user (or any available app). */
export async function makeGithubAppApi(userId?: string): Promise<GitHubAppApi> {
  const app = await getGithubApp(userId);
  if (!app) throw new Error('GitHub App not configured');
  return new GitHubAppApi(app.appId, decryptValue(app.privateKey));
}

/**
 * Get an installation access token.
 * Looks up the GitHub App associated with the installation's owner.
 */
export async function getInstallationToken(installationId: number): Promise<string> {
  // Find the user who owns this installation to use their GitHub App
  const instRows = await db.execute(
    sql`SELECT user_id FROM github_installations WHERE installation_id = ${installationId} LIMIT 1`,
  );
  const userId: string | undefined = (instRows as any).rows?.[0]?.user_id ?? undefined;
  const api = await makeGithubAppApi(userId);
  const { token } = await api.getInstallationToken(installationId);
  return token;
}

/** Build the clone URL with the installation token embedded. */
export function makeInstallationCloneUrl(repoUrl: string, token: string): string {
  // https://github.com/owner/repo.git  →  https://x-access-token:{token}@github.com/owner/repo.git
  return repoUrl.replace('https://', `https://x-access-token:${token}@`);
}

/** Get the app URL from settings (for webhook/callback config). */
export async function getAppUrl(): Promise<string> {
  const rows = await db.execute(sql`SELECT key, value FROM settings WHERE key IN ('interfaceDomain', 'wildcardDomain')`);
  const s: Record<string, string> = {};
  for (const r of (rows as any).rows ?? []) s[r.key] = r.value;
  if (s['interfaceDomain']) return `https://${s['interfaceDomain']}`;
  return `http://localhost:${process.env.PORT ?? 3001}`;
}
