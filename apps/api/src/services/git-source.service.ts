import * as crypto from 'crypto';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { config } from '../config.js';
import type { DbGitSource } from '../db/schema.js';
import type { GitRepo, GitBranch, DetectedBuild } from '@appk3s/shared';
import { detectBuildType } from './git-clone.service.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Encryption helpers ────────────────────────────────────────────────────────

const ALGO = 'aes-256-gcm';

function encryptToken(token: string): string {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(encToken: string): string {
  const key = getEncKey();
  const [ivHex, tagHex, dataHex] = encToken.split(':');
  if (!ivHex || !tagHex || !dataHex) return encToken; // fallback: plain text (legacy)
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

function getEncKey(): Buffer {
  const raw = config.encryptionKey ?? 'default-key-change-me-in-production!';
  return crypto.createHash('sha256').update(raw).digest();
}

// ── GitHub API ────────────────────────────────────────────────────────────────

export class GitHubApi {
  constructor(private accessToken: string) {}

  private async fetch(endpoint: string, opts?: RequestInit) {
    const res = await fetch(`https://api.github.com${endpoint}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AppK3s/1.0',
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${endpoint} → HTTP ${res.status}: ${body}`);
    }
    return res.json() as Promise<any>;
  }

  async getUser(): Promise<{ id: number; login: string; avatar_url: string; name?: string }> {
    return this.fetch('/user') as Promise<any>;
  }

  async listRepos(page = 1): Promise<GitRepo[]> {
    const raw = await this.fetch(
      `/user/repos?sort=updated&per_page=100&page=${page}&type=all`,
    ) as any[];
    return raw.map((r) => ({
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

  async listBranches(owner: string, repo: string): Promise<GitBranch[]> {
    const raw = await this.fetch(`/repos/${owner}/${repo}/branches?per_page=100`) as any[];
    return raw.map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected,
    }));
  }

  /** Create a webhook on a repo. Returns the webhook ID. */
  async createWebhook(owner: string, repo: string, webhookUrl: string, secret: string): Promise<number> {
    const data: any = await this.fetch(`/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0',
        },
      }),
    });
    return data.id;
  }

  /** Delete a webhook. */
  async deleteWebhook(owner: string, repo: string, hookId: number): Promise<void> {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${hookId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'User-Agent': 'AppK3s/1.0',
      },
    });
  }

  /** Detect build type by inspecting the repo tree. */
  async detectBuild(owner: string, repo: string, branch: string): Promise<DetectedBuild> {
    try {
      const tree: any = await this.fetch(
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=0`,
      );
      const files: string[] = tree.tree
        .filter((i: any) => i.type === 'blob')
        .map((i: any) => path.basename(i.path));
      return buildDetectionFromFileList(files);
    } catch {
      return { buildType: 'nixpacks', confidence: 'low', hasDockerfile: false, hasDockerCompose: false };
    }
  }
}

// ── GitLab API ────────────────────────────────────────────────────────────────

export class GitLabApi {
  constructor(private accessToken: string, private baseUrl = 'https://gitlab.com') {}

  private async fetch(endpoint: string, opts?: RequestInit) {
    const res = await fetch(`${this.baseUrl}/api/v4${endpoint}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitLab API ${endpoint} → HTTP ${res.status}: ${body}`);
    }
    return res.json() as Promise<any>;
  }

  async getUser(): Promise<{ id: number; username: string; avatar_url: string; name: string }> {
    return this.fetch('/user') as Promise<any>;
  }

  async listRepos(page = 1): Promise<GitRepo[]> {
    const raw = await this.fetch(
      `/projects?membership=true&order_by=last_activity_at&per_page=100&page=${page}&simple=true`,
    ) as any[];
    return raw.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.path_with_namespace,
      description: r.description,
      private: r.visibility !== 'public',
      url: r.http_url_to_repo,
      defaultBranch: r.default_branch ?? 'main',
      updatedAt: r.last_activity_at,
    }));
  }

  async listBranches(projectId: string): Promise<GitBranch[]> {
    const raw = await this.fetch(`/projects/${encodeURIComponent(projectId)}/repository/branches?per_page=100`) as any[];
    return raw.map((b) => ({
      name: b.name,
      sha: b.commit.id,
      protected: b.protected,
    }));
  }

  async createWebhook(projectId: string, webhookUrl: string, secret: string): Promise<number> {
    const data = await this.fetch(`/projects/${encodeURIComponent(projectId)}/hooks`, {
      method: 'POST',
      body: JSON.stringify({
        url: webhookUrl,
        push_events: true,
        token: secret,
        enable_ssl_verification: true,
      }),
    }) as any;
    return data.id;
  }

  async detectBuild(projectId: string, branch: string): Promise<DetectedBuild> {
    try {
      const tree = await this.fetch(
        `/projects/${encodeURIComponent(projectId)}/repository/tree?ref=${branch}&per_page=100`,
      ) as any[];
      const files = tree.filter((i) => i.type === 'blob').map((i: any) => path.basename(i.name));
      return buildDetectionFromFileList(files);
    } catch {
      return { buildType: 'nixpacks', confidence: 'low', hasDockerfile: false, hasDockerCompose: false };
    }
  }
}

// ── Shared detection from file list ──────────────────────────────────────────

function buildDetectionFromFileList(files: string[]): DetectedBuild {
  const hasDockerfile = files.some((f) => /^dockerfile$/i.test(f));
  const hasDockerCompose = files.some((f) => /^docker-compose\.ya?ml$/i.test(f));

  const langChecks: Array<{ files: string[]; lang: string }> = [
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

// ── Git Source CRUD ───────────────────────────────────────────────────────────

export async function createGitSource(data: {
  userId: string;
  provider: 'github' | 'gitlab';
  name: string;
  providerId?: string;
  username?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scopes?: string;
}): Promise<DbGitSource> {
  const [source] = await db.insert(schema.gitSources).values({
    ...data,
    accessToken: encryptToken(data.accessToken),
    refreshToken: data.refreshToken ? encryptToken(data.refreshToken) : null,
  }).returning();
  return source;
}

export async function getGitSourceToken(source: DbGitSource): Promise<string> {
  return decryptToken(source.accessToken);
}

export function makeGitApi(source: DbGitSource): GitHubApi | GitLabApi {
  const token = decryptToken(source.accessToken);
  if (source.provider === 'github') return new GitHubApi(token);
  return new GitLabApi(token);
}
