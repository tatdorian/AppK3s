import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { DbApplication, DbDeployment } from '../db/schema.js';
import { KubernetesService } from './kubernetes.service.js';
import { ComposeService } from './compose.service.js';
import { GithubService } from './github.service.js';
import { BuilderService } from './builder.service.js';
import { cloneRepo, cleanupDir } from './git-clone.service.js';
import { makeGitApi, decryptToken } from './git-source.service.js';
import { getInstallationToken, makeInstallationCloneUrl } from './github-app.service.js';
import { dispatchNotification } from './notification.service.js';

export class DeploymentService {
  private compose: ComposeService;
  private github: GithubService;
  private builder: BuilderService;

  constructor(private k8s: KubernetesService) {
    this.compose = new ComposeService(k8s);
    this.github = new GithubService();
    this.builder = new BuilderService();
  }

  async deploy(app: DbApplication, triggeredById?: string): Promise<DbDeployment> {
    // Create deployment record
    const [deployment] = await db
      .insert(schema.deployments)
      .values({ applicationId: app.id, status: 'running', triggeredById })
      .returning();

    // Mark app as deploying
    await db
      .update(schema.applications)
      .set({ status: 'deploying', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));

    // Run async - don't block the HTTP response
    this.runDeploy(app, deployment.id, triggeredById).catch(console.error);

    return deployment;
  }

  /** Deploy a specific image tag (used for rollback). */
  async rollback(app: DbApplication, imageTag: string, triggeredById?: string): Promise<DbDeployment> {
    const [deployment] = await db
      .insert(schema.deployments)
      .values({
        applicationId: app.id,
        status: 'running',
        triggeredById,
        imageTag,
        commitMessage: `Rollback to ${imageTag}`,
      })
      .returning();

    await db
      .update(schema.applications)
      .set({ status: 'deploying', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));

    this.runRollback(app, imageTag, deployment.id, triggeredById).catch(console.error);
    return deployment;
  }

  private async runRollback(
    app: DbApplication,
    imageTag: string,
    deploymentId: string,
    triggeredById?: string,
  ): Promise<void> {
    const appendLog = this.makeAppendLog(deploymentId);
    try {
      await appendLog(`[ROLLBACK] Rolling back to image: ${imageTag}`);

      // Parse image name and tag
      const lastColon = imageTag.lastIndexOf(':');
      const imageName = lastColon > 0 ? imageTag.slice(0, lastColon) : imageTag;
      const tag = lastColon > 0 ? imageTag.slice(lastColon + 1) : 'latest';

      // Update app image reference
      const [updated] = await db
        .update(schema.applications)
        .set({ image: imageName, imageTag: tag, updatedAt: new Date() })
        .where(eq(schema.applications.id, app.id))
        .returning();

      await appendLog(`[ROLLBACK] Applying k8s deployment with image ${imageTag}…`);
      await this.k8s.applyDeployment(updated);
      await this.k8s.applyService(updated);

      await appendLog(`[ROLLBACK] Rollback complete ✓`);
      await this.finishDeploy(deploymentId, app.id, 'success', imageTag);
    } catch (err: any) {
      await this.failDeploy(deploymentId, app.id, err?.message ?? String(err));
    }
  }

  private async runDeploy(
    app: DbApplication,
    deploymentId: string,
    triggeredById?: string,
  ): Promise<void> {
    const appendLog = this.makeAppendLog(deploymentId);

    let cloneDir: string | undefined;

    try {
      await this.k8s.ensureNamespace(app.namespace);
      await appendLog(`[DEPLOY] Ensuring namespace: ${app.namespace}`);

      // Auto-assign subdomain/domain from cluster defaults if not set
      let effectiveApp = await this.maybeAssignDomain(app, appendLog);

      // ── Route by app type ──────────────────────────────────────────────────

      if (effectiveApp.type === 'git' || effectiveApp.type === 'github-app') {
        // ── Coolify-like git build (OAuth source ou GitHub App) ────────────
        const result = await this.deployGitBuild(effectiveApp, deploymentId, appendLog);
        cloneDir = result.cloneDir;

        await this.finishDeploy(deploymentId, app.id, 'success', result.imageTag, result.commitSha, result.commitMessage);
        await this.notifySuccess(triggeredById, app);

      } else if (effectiveApp.type === 'github') {
        // ── Legacy: fetch docker-compose from GitHub PAT ───────────────────
        await appendLog(`[GITHUB] Fetching docker-compose.yml from: ${effectiveApp.githubUrl}`);
        const fetchedContent = await this.github.fetchComposeContent(effectiveApp);

        const [withContent] = await db
          .update(schema.applications)
          .set({ composeContent: fetchedContent, updatedAt: new Date() })
          .where(eq(schema.applications.id, effectiveApp.id))
          .returning();
        effectiveApp = withContent;

        await appendLog(`[COMPOSE] Applying Kubernetes resources…`);
        await this.compose.deployCompose(effectiveApp);
        await this.finishDeploy(deploymentId, app.id, 'success');
        await this.notifySuccess(triggeredById, app);

      } else if (effectiveApp.type === 'compose') {
        // ── Inline docker-compose ──────────────────────────────────────────
        await appendLog(`[COMPOSE] Applying resources…`);
        await this.compose.deployCompose(effectiveApp);
        await this.finishDeploy(deploymentId, app.id, 'success');
        await this.notifySuccess(triggeredById, app);

      } else {
        // ── Docker image (direct) ──────────────────────────────────────────
        if (effectiveApp.envVars.length > 0) {
          await appendLog(`[K8S] Applying Secret (env vars)`);
          await this.k8s.applySecret(effectiveApp);
        }
        for (const vol of effectiveApp.volumes) {
          await appendLog(`[K8S] Creating PVC: ${vol.name}`);
          await this.k8s.applyPVC(effectiveApp, vol.name, vol.size, vol.storageClass);
        }
        await appendLog(`[K8S] Applying Deployment: ${effectiveApp.name}`);
        await this.k8s.applyDeployment(effectiveApp);
        await appendLog(`[K8S] Applying Service: ${effectiveApp.name}`);
        await this.k8s.applyService(effectiveApp);
        if (effectiveApp.subdomain && effectiveApp.domain) {
          await appendLog(`[K8S] Applying Ingress: ${effectiveApp.subdomain}.${effectiveApp.domain}`);
          await this.k8s.applyIngress(effectiveApp);
        }
        await this.finishDeploy(deploymentId, app.id, 'success');
        await this.notifySuccess(triggeredById, app);
      }

    } catch (err: any) {
      const message = err?.message ?? String(err);
      await this.failDeploy(deploymentId, app.id, message);
      await this.notifyFailure(triggeredById, app, message);
      console.error(`Deploy failed for app ${app.name}:`, err);
    } finally {
      if (cloneDir) cleanupDir(cloneDir);
    }
  }

  // ── Git build pipeline ────────────────────────────────────────────────────

  private async deployGitBuild(
    app: DbApplication,
    deploymentId: string,
    appendLog: (line: string) => Promise<void>,
  ): Promise<{ imageTag: string; commitSha: string; commitMessage: string; cloneDir: string }> {

    const repoUrl = app.gitRepoUrl ?? app.githubUrl;
    if (!repoUrl) throw new Error('Git repo URL is required for git build type');

    const branch = app.gitBranch ?? app.githubBranch ?? 'main';

    // Get access token — priority: GitHub App installation > OAuth source > legacy PAT
    let effectiveRepoUrl = repoUrl;
    let accessToken: string | undefined;

    if (app.type === 'github-app' && app.githubInstallationId) {
      // Fetch the installation row to get the numeric installation_id
      const installRows = await db.execute(
        sql`SELECT installation_id FROM github_installations WHERE id = ${app.githubInstallationId}`,
      );
      if ((installRows as any).rows && (installRows as any).rows.length > 0) {
        const numericId = Number((installRows as any).rows[0].installation_id);
        const token = await getInstallationToken(numericId);
        effectiveRepoUrl = makeInstallationCloneUrl(repoUrl, token);
        await appendLog(`[GIT] Using GitHub App installation token for clone`);
      }
    } else if (app.gitSourceId) {
      const source = await db.query.gitSources.findFirst({
        where: eq(schema.gitSources.id, app.gitSourceId),
      });
      if (source) accessToken = decryptToken(source.accessToken);
    } else if (app.githubToken) {
      accessToken = app.githubToken;
    }

    // Clone the repo
    const { dir, commitSha, commitMessage } = await cloneRepo({
      repoUrl: effectiveRepoUrl,
      branch,
      accessToken,
      appId: app.id,
      deploymentId,
      onLog: appendLog,
    });

    // Build the image
    await appendLog(`[BUILD] Starting build…`);
    const { imageTag } = await this.builder.build(app, dir, commitSha, appendLog);

    // Update app with new image reference and last commit info
    // Use lastIndexOf to handle registry URLs like "192.168.188.10:5000/appk3s/name:sha"
    const lastColon = imageTag.lastIndexOf(':');
    const imageRepo = imageTag.substring(0, lastColon);
    const imageVersion = imageTag.substring(lastColon + 1) || commitSha.slice(0, 12);
    await db.update(schema.applications).set({
      image: imageRepo,
      imageTag: imageVersion,
      lastCommitSha: commitSha,
      lastCommitMessage: commitMessage,
      updatedAt: new Date(),
    }).where(eq(schema.applications.id, app.id));

    // Fetch updated app for k8s deployment
    const updatedApp = await db.query.applications.findFirst({
      where: eq(schema.applications.id, app.id),
    });
    if (!updatedApp) throw new Error('Application not found after update');

    // Apply k8s resources
    await appendLog(`[K8S] Applying Kubernetes resources…`);
    if (updatedApp.envVars.length > 0) {
      await this.k8s.applySecret(updatedApp);
    }
    for (const vol of updatedApp.volumes) {
      await this.k8s.applyPVC(updatedApp, vol.name, vol.size, vol.storageClass);
    }
    await this.k8s.applyDeployment(updatedApp);
    await this.k8s.applyService(updatedApp);
    if (updatedApp.subdomain && updatedApp.domain) {
      await appendLog(`[K8S] Applying Ingress: ${updatedApp.subdomain}.${updatedApp.domain}`);
      await this.k8s.applyIngress(updatedApp);
    }

    // Prune old images (keep last 5)
    this.builder.pruneOldImages(app.name, appendLog).catch(() => {});

    return { imageTag, commitSha, commitMessage, cloneDir: dir };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeAppendLog(deploymentId: string) {
    return async (line: string) => {
      const ts = new Date().toISOString();
      await db.execute(
        sql`UPDATE deployments SET logs = logs || ${`[${ts}] ${line}\n`} WHERE id = ${deploymentId}`,
      );
    };
  }

  private async maybeAssignDomain(
    app: DbApplication,
    appendLog: (line: string) => Promise<void>,
  ): Promise<DbApplication> {
    if (app.subdomain && app.domain) return app;

    const settingsRows = await db.query.settings.findMany();
    const s = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const defaultDomain = s['defaultDomain'] ?? '';
    if (!defaultDomain) return app;

    const [updated] = await db
      .update(schema.applications)
      .set({
        subdomain: app.name,
        domain: defaultDomain,
        ingressClass: s['defaultIngressClass'] ?? 'traefik',
        tlsEnabled: s['defaultTls'] === 'true',
        updatedAt: new Date(),
      })
      .where(eq(schema.applications.id, app.id))
      .returning();

    await appendLog(`[DEPLOY] Auto-assigned domain: ${app.name}.${defaultDomain}`);
    return updated;
  }

  private async finishDeploy(
    deploymentId: string,
    appId: string,
    status: 'success' | 'failed',
    imageTag?: string,
    commitSha?: string,
    commitMessage?: string,
  ): Promise<void> {
    const appendLog = this.makeAppendLog(deploymentId);
    await appendLog(`[DEPLOY] Deployment ${status === 'success' ? 'complete ✓' : 'failed ✗'}`);

    await db.update(schema.deployments).set({
      status,
      completedAt: new Date(),
      ...(imageTag ? { imageTag } : {}),
      ...(commitSha ? { commitSha } : {}),
      ...(commitMessage ? { commitMessage } : {}),
    }).where(eq(schema.deployments.id, deploymentId));

    await db.update(schema.applications).set({
      status: status === 'success' ? 'running' : 'error',
      updatedAt: new Date(),
    }).where(eq(schema.applications.id, appId));
  }

  private async failDeploy(deploymentId: string, appId: string, error: string): Promise<void> {
    await db.update(schema.deployments).set({
      status: 'failed',
      error,
      completedAt: new Date(),
    }).where(eq(schema.deployments.id, deploymentId));

    await db.update(schema.applications).set({
      status: 'error',
      updatedAt: new Date(),
    }).where(eq(schema.applications.id, appId));
  }

  private async notifySuccess(triggeredById: string | undefined, app: DbApplication): Promise<void> {
    if (!triggeredById) return;
    const accessUrl = app.subdomain && app.domain
      ? `${app.tlsEnabled ? 'https' : 'http'}://${app.subdomain}.${app.domain}`
      : undefined;
    dispatchNotification('deploy.success', triggeredById, {
      appName: app.name, appId: app.id, url: accessUrl,
    }).catch(() => {});
  }

  private async notifyFailure(
    triggeredById: string | undefined,
    app: DbApplication,
    error: string,
  ): Promise<void> {
    if (!triggeredById) return;
    dispatchNotification('deploy.fail', triggeredById, {
      appName: app.name, appId: app.id, error,
    }).catch(() => {});
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(app: DbApplication): Promise<void> {
    await this.k8s.scaleDeployment(app, app.replicas || 1);
    await db.update(schema.applications)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));
  }

  async stop(app: DbApplication): Promise<void> {
    await this.k8s.scaleDeployment(app, 0);
    await db.update(schema.applications)
      .set({ status: 'stopped', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));
  }

  async restart(app: DbApplication): Promise<void> {
    await this.k8s.restartDeployment(app);
    await db.update(schema.applications)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));
  }

  async delete(app: DbApplication): Promise<void> {
    if (app.type === 'compose' || app.type === 'github' || app.type === 'git') {
      if (app.composeContent) await this.compose.deleteCompose(app);
    } else {
      await this.k8s.deleteApp(app);
    }
  }
}
