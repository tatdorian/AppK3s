import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { BuildType, DetectedBuild } from '@appk3s/shared';

const BUILD_BASE = '/tmp/appk3s-builds';

export interface CloneResult {
  dir: string;
  commitSha: string;
  commitMessage: string;
}

/**
 * Detects the best build type for a cloned repository.
 * Priority: Dockerfile > docker-compose > nixpacks detectable languages > static
 */
export function detectBuildType(dir: string): DetectedBuild {
  const files = listFiles(dir);

  const hasDockerfile = files.some((f) =>
    /^dockerfile$/i.test(f) || /^dockerfile\./i.test(f),
  );
  const hasDockerCompose = files.some((f) =>
    /^docker-compose\.ya?ml$/i.test(f),
  );

  // Nixpacks language detection (order matters — more specific first)
  const langChecks: Array<{ files: string[]; lang: string }> = [
    { files: ['package.json'], lang: 'node' },
    { files: ['requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py', 'setup.cfg'], lang: 'python' },
    { files: ['go.mod'], lang: 'go' },
    { files: ['Cargo.toml'], lang: 'rust' },
    { files: ['Gemfile'], lang: 'ruby' },
    { files: ['composer.json'], lang: 'php' },
    { files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradlew'], lang: 'java' },
    { files: ['*.csproj', '*.fsproj', '*.vbproj'], lang: 'dotnet' },
    { files: ['mix.exs'], lang: 'elixir' },
    { files: ['pubspec.yaml'], lang: 'dart' },
    { files: ['deno.json', 'deno.jsonc'], lang: 'deno' },
  ];

  let nixpacksLanguage: string | undefined;
  for (const check of langChecks) {
    const matched = check.files.some((pattern) => {
      if (pattern.includes('*')) {
        const ext = pattern.replace('*.', '.');
        return files.some((f) => f.endsWith(ext));
      }
      return files.includes(pattern);
    });
    if (matched) {
      nixpacksLanguage = check.lang;
      break;
    }
  }

  // Static detection: has index.html (or only html/css/js files)
  const hasIndexHtml = files.includes('index.html');
  const hasOnlyStaticFiles =
    files.length > 0 &&
    files.every((f) => /\.(html|css|js|json|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|map|txt)$/i.test(f));

  // Decision tree (mirrors Coolify's logic)
  if (hasDockerfile) {
    return {
      buildType: 'dockerfile',
      confidence: 'high',
      hasDockerfile,
      hasDockerCompose,
      nixpacksLanguage,
    };
  }
  if (hasDockerCompose) {
    return {
      buildType: 'docker-compose',
      confidence: 'high',
      hasDockerfile,
      hasDockerCompose,
      nixpacksLanguage,
    };
  }
  if (nixpacksLanguage) {
    return {
      buildType: 'nixpacks',
      language: nixpacksLanguage,
      confidence: 'high',
      hasDockerfile,
      hasDockerCompose,
      nixpacksLanguage,
    };
  }
  if (hasIndexHtml || hasOnlyStaticFiles) {
    return {
      buildType: 'static',
      confidence: hasIndexHtml ? 'high' : 'medium',
      hasDockerfile,
      hasDockerCompose,
    };
  }

  // Fallback: try nixpacks anyway (it supports many more languages)
  return {
    buildType: 'nixpacks',
    confidence: 'low',
    hasDockerfile,
    hasDockerCompose,
  };
}

/** Lists files in the top-level of a directory (non-recursive). */
function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return stat.isFile();
    });
  } catch {
    return [];
  }
}

/**
 * Clones a git repository at a specific branch to a temp dir.
 * Returns the temp dir path plus the HEAD commit SHA and message.
 */
export async function cloneRepo(opts: {
  repoUrl: string;
  branch: string;
  accessToken?: string;
  appId: string;
  deploymentId: string;
  onLog: (line: string) => Promise<void>;
}): Promise<CloneResult> {
  const { repoUrl, branch, accessToken, appId, deploymentId, onLog } = opts;

  // Create unique temp dir
  const rand = crypto.randomBytes(4).toString('hex');
  const dir = path.join(BUILD_BASE, `${appId}-${deploymentId}-${rand}`);
  fs.mkdirSync(dir, { recursive: true });

  // Build authenticated URL
  let cloneUrl = repoUrl;
  if (accessToken) {
    try {
      const u = new URL(repoUrl.startsWith('http') ? repoUrl : `https://${repoUrl}`);
      u.username = 'oauth2';
      u.password = accessToken;
      cloneUrl = u.toString();
    } catch {
      // keep original
    }
  }

  await onLog(`[GIT] Cloning ${repoUrl} (branch: ${branch}) ...`);

  await runCommand(
    'git',
    ['clone', '--depth=1', '--branch', branch, cloneUrl, dir],
    { onLog, cwd: '/tmp', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
  );

  // Get commit info
  let commitSha = '';
  let commitMessage = '';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();
    commitMessage = execSync('git log -1 --pretty=%s', { cwd: dir }).toString().trim();
  } catch {
    commitSha = 'unknown';
    commitMessage = '';
  }

  await onLog(`[GIT] Cloned @ ${commitSha.slice(0, 8)} — ${commitMessage}`);

  return { dir, commitSha, commitMessage };
}

/** Runs a command and streams output to onLog. Throws on non-zero exit. */
export function runCommand(
  cmd: string,
  args: string[],
  opts: {
    onLog: (line: string) => Promise<void>;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const flush = async (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (line.trim()) await opts.onLog(line);
      }
    };

    proc.stdout.on('data', flush);
    proc.stderr.on('data', flush);

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command \`${cmd} ${args.join(' ')}\` exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

/** Removes a temp build directory. */
export function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}
