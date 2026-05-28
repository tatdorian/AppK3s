import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { DbApplication } from '../db/schema.js';
import type { BuildType } from '@appk3s/shared';
import { runCommand, detectBuildType } from './git-clone.service.js';

// Local Docker registry — all built images are pushed here so every k3s node can pull them
export const LOCAL_REGISTRY = process.env.LOCAL_REGISTRY ?? '192.168.188.10:5000';

export interface BuildResult {
  imageTag: string;
}

/**
 * BuilderService — builds a Docker image from source code.
 *
 * Supported strategies (identical to Coolify):
 *   - nixpacks   → auto-detect language, build via nixpacks CLI
 *   - dockerfile → standard `docker build`
 *   - docker-compose → build all services defined in compose file
 *   - static     → copy files into nginx image
 *
 * After building, the image is imported into k3s containerd so pods can use
 * it with `imagePullPolicy: Never` (no external registry needed).
 */
export class BuilderService {

  async build(
    app: DbApplication,
    cloneDir: string,
    commitSha: string,
    onLog: (line: string) => Promise<void>,
  ): Promise<BuildResult> {

    const buildType = (app.buildType ?? this.autoDetect(cloneDir)) as BuildType;
    const buildDir  = path.join(cloneDir, app.buildDir ?? '.');
    const shortSha  = commitSha.slice(0, 12);
    // Use local registry so all k3s nodes can pull the image
    const imageTag  = `${LOCAL_REGISTRY}/appk3s/${app.name}:${shortSha}`;

    await onLog(`[BUILD] Strategy: ${buildType.toUpperCase()}`);
    await onLog(`[BUILD] Image tag: ${imageTag}`);

    switch (buildType) {
      case 'nixpacks':
        await this.buildNixpacks(app, buildDir, imageTag, onLog);
        break;
      case 'dockerfile':
        await this.buildDockerfile(app, buildDir, imageTag, onLog);
        break;
      case 'docker-compose':
        await this.buildDockerCompose(app, buildDir, imageTag, onLog);
        break;
      case 'static':
        await this.buildStatic(app, buildDir, imageTag, onLog);
        break;
      default:
        throw new Error(`Unknown build type: ${buildType}`);
    }

    // Push to local registry so all k3s nodes can pull the image
    await onLog(`[BUILD] Pushing image to local registry…`);
    await this.pushToRegistry(imageTag, onLog);

    return { imageTag };
  }

  // ── Nixpacks ────────────────────────────────────────────────────────────────

  private async buildNixpacks(
    app: DbApplication,
    dir: string,
    imageTag: string,
    onLog: (line: string) => Promise<void>,
  ) {
    await onLog(`[NIXPACKS] Auto-detecting language in ${dir}…`);

    // Build nixpacks args
    const args: string[] = ['build', dir, '--name', imageTag];

    // Custom commands if set
    if (app.installCommand) { args.push('--install-cmd', app.installCommand); }
    if (app.buildCommand)   { args.push('--build-cmd',   app.buildCommand); }
    if (app.startCommand)   { args.push('--start-cmd',   app.startCommand); }

    // Run nixpacks (must be installed on the server)
    try {
      await runCommand('nixpacks', args, { onLog, cwd: dir });
    } catch (err: any) {
      if (err.message?.includes('not found') || err.message?.includes('ENOENT')) {
        throw new Error(
          'nixpacks CLI introuvable sur le serveur. Installez-le via : curl -sSL https://nixpacks.com/install.sh | bash',
        );
      }
      throw err;
    }
  }

  // ── Dockerfile ──────────────────────────────────────────────────────────────

  private async buildDockerfile(
    app: DbApplication,
    dir: string,
    imageTag: string,
    onLog: (line: string) => Promise<void>,
  ) {
    const dockerfilePath = path.join(dir, app.dockerfilePath ?? 'Dockerfile');

    if (!fs.existsSync(dockerfilePath)) {
      throw new Error(`Dockerfile not found at: ${dockerfilePath}`);
    }

    await onLog(`[DOCKER] Building from ${dockerfilePath}…`);

    const args = [
      'build',
      '--no-cache',
      '-t', imageTag,
      '-f', dockerfilePath,
      dir,
    ];

    await runCommand('docker', args, { onLog, cwd: dir });
  }

  // ── Docker Compose ──────────────────────────────────────────────────────────

  private async buildDockerCompose(
    app: DbApplication,
    dir: string,
    imageTag: string,
    onLog: (line: string) => Promise<void>,
  ) {
    // For compose builds, we build all services and tag the first one
    await onLog(`[COMPOSE] Building services from docker-compose.yml…`);

    await runCommand('docker', ['compose', 'build', '--no-cache'], {
      onLog,
      cwd: dir,
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: `appk3s-${app.name}`,
      },
    });

    // Tag the main service image with our tag convention
    // We'll store the compose file content for k8s deployment
    await onLog(`[COMPOSE] Build complete — services will be deployed via compose translation`);
  }

  // ── Static ──────────────────────────────────────────────────────────────────

  private async buildStatic(
    app: DbApplication,
    dir: string,
    imageTag: string,
    onLog: (line: string) => Promise<void>,
  ) {
    const publishDir = app.publishDir ?? 'public';
    await onLog(`[STATIC] Serving static files from ${publishDir}/`);

    // If there's a build command, run it first (e.g. npm run build)
    if (app.buildCommand) {
      await onLog(`[STATIC] Running build command: ${app.buildCommand}`);
      const [cmd, ...cmdArgs] = app.buildCommand.split(' ');
      await runCommand(cmd, cmdArgs, { onLog, cwd: dir });
    } else if (app.installCommand) {
      await onLog(`[STATIC] Running install command: ${app.installCommand}`);
      const [cmd, ...cmdArgs] = app.installCommand.split(' ');
      await runCommand(cmd, cmdArgs, { onLog, cwd: dir });
    }

    // Generate a minimal nginx Dockerfile
    const staticDir = path.join(dir, publishDir);
    const resolvedDir = fs.existsSync(staticDir) ? staticDir : dir;

    const nginxConf = `server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html index.htm;
    location / {
        try_files $uri $uri/ /index.html;
    }
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}`;

    const dockerfileContent = `FROM nginx:alpine
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;

    fs.writeFileSync(path.join(resolvedDir, 'nginx.conf'), nginxConf);
    fs.writeFileSync(path.join(resolvedDir, 'Dockerfile.static'), dockerfileContent);

    await onLog(`[STATIC] Building nginx image…`);
    await runCommand('docker', [
      'build',
      '--no-cache',
      '-t', imageTag,
      '-f', path.join(resolvedDir, 'Dockerfile.static'),
      resolvedDir,
    ], { onLog, cwd: resolvedDir });
  }

  // ── Push to local registry ───────────────────────────────────────────────────

  private async pushToRegistry(imageTag: string, onLog: (line: string) => Promise<void>) {
    try {
      await runCommand('docker', ['push', imageTag], { onLog });
      await onLog(`[BUILD] ✓ Image pushed to ${LOCAL_REGISTRY}`);
    } catch (err: any) {
      throw new Error(`Failed to push image to local registry (${LOCAL_REGISTRY}): ${err.message}`);
    }
  }

  // ── Auto-detect ─────────────────────────────────────────────────────────────

  autoDetect(dir: string): BuildType {
    const detected = detectBuildType(dir);
    return detected.buildType;
  }

  /** Prune old images to free disk space (keep last 5 per app). */
  async pruneOldImages(appName: string, onLog?: (line: string) => Promise<void>) {
    try {
      const log = onLog ?? (async (_: string) => {});
      const repo = `${LOCAL_REGISTRY}/appk3s/${appName}`;
      const out = require('child_process').execSync(
        `docker images "${repo}" --format "{{.Tag}}" 2>/dev/null || true`,
      ).toString().trim();
      const tags = out.split('\n').filter(Boolean);
      if (tags.length > 5) {
        const toRemove = tags.slice(5);
        for (const tag of toRemove) {
          try {
            require('child_process').execSync(`docker rmi "${repo}:${tag}" 2>/dev/null || true`);
            await log(`[BUILD] Pruned old image ${repo}:${tag}`);
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore pruning errors */ }
  }
}

/** Generate a random webhook secret. */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}
