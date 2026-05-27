import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { DbApplication, DbDeployment } from '../db/schema.js';
import { KubernetesService } from './kubernetes.service.js';
import { ComposeService } from './compose.service.js';
import { GithubService } from './github.service.js';

export class DeploymentService {
  private compose: ComposeService;
  private github: GithubService;

  constructor(private k8s: KubernetesService) {
    this.compose = new ComposeService(k8s);
    this.github = new GithubService();
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
    this.runDeploy(app, deployment.id).catch(console.error);

    return deployment;
  }

  private async runDeploy(app: DbApplication, deploymentId: string): Promise<void> {
    // Append a log line by SQL concat (avoids read-modify-write race condition)
    const appendLog = async (line: string) => {
      await db.execute(
        sql`UPDATE deployments SET logs = logs || ${line + '\n'} WHERE id = ${deploymentId}`,
      );
    };

    try {
      await this.k8s.ensureNamespace(app.namespace);
      await appendLog(`[${new Date().toISOString()}] Ensuring namespace ${app.namespace}`);

      // Auto-assign subdomain from cluster defaultDomain if none set
      let effectiveApp = app;
      const settingsRows = await db.query.settings.findMany();
      const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

      if (!app.subdomain || !app.domain) {
        const defaultDomain = settingsMap['defaultDomain'] ?? '';
        const defaultIngressClass = settingsMap['defaultIngressClass'] ?? 'traefik';
        const defaultTls = settingsMap['defaultTls'] === 'true';

        if (defaultDomain) {
          const [updated] = await db
            .update(schema.applications)
            .set({
              subdomain: app.name,
              domain: defaultDomain,
              ingressClass: defaultIngressClass,
              tlsEnabled: defaultTls,
              updatedAt: new Date(),
            })
            .where(eq(schema.applications.id, app.id))
            .returning();
          effectiveApp = updated;
          await appendLog(
            `[${new Date().toISOString()}] Auto-assigned domain: ${app.name}.${defaultDomain} (TLS: ${defaultTls})`,
          );
        }
      }

      if (effectiveApp.type === 'github') {
        await appendLog(`[${new Date().toISOString()}] Récupération du docker-compose.yml depuis GitHub : ${effectiveApp.githubUrl}`);
        const fetchedContent = await this.github.fetchComposeContent(effectiveApp);

        // Persist the fetched content for display and idempotent deletion
        const [withContent] = await db
          .update(schema.applications)
          .set({ composeContent: fetchedContent, updatedAt: new Date() })
          .where(eq(schema.applications.id, effectiveApp.id))
          .returning();
        effectiveApp = withContent;

        await appendLog(`[${new Date().toISOString()}] Parsing docker-compose et application des ressources Kubernetes`);
        await this.compose.deployCompose(effectiveApp);

      } else if (effectiveApp.type === 'compose') {
        await appendLog(`[${new Date().toISOString()}] Parsing docker-compose and applying resources`);
        await this.compose.deployCompose(effectiveApp);
      } else {
        if (effectiveApp.envVars.length > 0) {
          await appendLog(`[${new Date().toISOString()}] Applying Secret (env vars)`);
          await this.k8s.applySecret(effectiveApp);
        }

        for (const vol of effectiveApp.volumes) {
          await appendLog(`[${new Date().toISOString()}] Creating PVC: ${vol.name}`);
          await this.k8s.applyPVC(effectiveApp, vol.name, vol.size, vol.storageClass);
        }

        await appendLog(`[${new Date().toISOString()}] Applying Deployment: ${effectiveApp.name}`);
        await this.k8s.applyDeployment(effectiveApp);

        await appendLog(`[${new Date().toISOString()}] Applying Service: ${effectiveApp.name}`);
        await this.k8s.applyService(effectiveApp);

        if (effectiveApp.subdomain && effectiveApp.domain) {
          await appendLog(
            `[${new Date().toISOString()}] Applying Ingress: ${effectiveApp.subdomain}.${effectiveApp.domain}`,
          );
          // Toujours un cert individuel Let's Encrypt par app (via ensureCertificate).
          // Le secret wildcard-tls n'est pas utilisé — il n'est pas garanti d'exister.
          await this.k8s.applyIngress(effectiveApp);
        }
      }

      await appendLog(`[${new Date().toISOString()}] Deployment complete ✓`);

      await db
        .update(schema.deployments)
        .set({ status: 'success', completedAt: new Date() })
        .where(eq(schema.deployments.id, deploymentId));

      await db
        .update(schema.applications)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(schema.applications.id, app.id));
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await db
        .update(schema.deployments)
        .set({ status: 'failed', error: message, completedAt: new Date() })
        .where(eq(schema.deployments.id, deploymentId));

      await db
        .update(schema.applications)
        .set({ status: 'error', updatedAt: new Date() })
        .where(eq(schema.applications.id, app.id));

      console.error(`Deploy failed for app ${app.name}:`, err);
    }
  }

  async start(app: DbApplication): Promise<void> {
    await this.k8s.scaleDeployment(app, app.replicas || 1);
    await db
      .update(schema.applications)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));
  }

  async stop(app: DbApplication): Promise<void> {
    await this.k8s.scaleDeployment(app, 0);
    await db
      .update(schema.applications)
      .set({ status: 'stopped', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));
  }

  async restart(app: DbApplication): Promise<void> {
    await this.k8s.restartDeployment(app);
    await db
      .update(schema.applications)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));
  }

  async delete(app: DbApplication): Promise<void> {
    if (app.type === 'compose' || app.type === 'github') {
      // composeContent is null if the app was never deployed — nothing to clean up in k8s
      if (app.composeContent) {
        await this.compose.deleteCompose(app);
      }
    } else {
      await this.k8s.deleteApp(app);
    }
  }
}
