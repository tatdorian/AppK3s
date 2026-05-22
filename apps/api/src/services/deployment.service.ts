import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { DbApplication, DbDeployment } from '../db/schema.js';
import { KubernetesService } from './kubernetes.service.js';
import { ComposeService } from './compose.service.js';

export class DeploymentService {
  private compose: ComposeService;

  constructor(private k8s: KubernetesService) {
    this.compose = new ComposeService(k8s);
  }

  async deploy(app: DbApplication): Promise<DbDeployment> {
    // Create deployment record
    const [deployment] = await db
      .insert(schema.deployments)
      .values({ applicationId: app.id, status: 'running' })
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

      if (app.type === 'compose') {
        await appendLog(`[${new Date().toISOString()}] Parsing docker-compose and applying resources`);
        await this.compose.deployCompose(app);
      } else {
        if (app.envVars.length > 0) {
          await appendLog(`[${new Date().toISOString()}] Applying Secret (env vars)`);
          await this.k8s.applySecret(app);
        }

        for (const vol of app.volumes) {
          await appendLog(`[${new Date().toISOString()}] Creating PVC: ${vol.name}`);
          await this.k8s.applyPVC(app, vol.name, vol.size, vol.storageClass);
        }

        await appendLog(`[${new Date().toISOString()}] Applying Deployment: ${app.name}`);
        await this.k8s.applyDeployment(app);

        await appendLog(`[${new Date().toISOString()}] Applying Service: ${app.name}`);
        await this.k8s.applyService(app);

        if (app.subdomain && app.domain) {
          await appendLog(`[${new Date().toISOString()}] Applying Ingress: ${app.subdomain}.${app.domain}`);
          await this.k8s.applyIngress(app);
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
    if (app.type === 'compose') {
      await this.compose.deleteCompose(app);
    } else {
      await this.k8s.deleteApp(app);
    }
  }
}
