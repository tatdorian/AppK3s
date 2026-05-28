import type { FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { DeploymentService } from '../services/deployment.service.js';
import { KubernetesService } from '../services/kubernetes.service.js';

const k8s = new KubernetesService();
const deployService = new DeploymentService(k8s);

// ─── HMAC validation helpers ──────────────────────────────────────────────────

/**
 * Validate GitHub webhook signature using the request body as a string.
 * GitHub sends X-Hub-Signature-256: sha256=<hex>
 */
function verifyGitHubSignature(
  payloadStr: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return !secret; // no secret = open webhook
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payloadStr, 'utf8')
    .digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifyGitLabToken(token: string, secret: string): boolean {
  if (!token || !secret) return !secret;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function webhooksRoutes(fastify: FastifyInstance) {

  // ── GitHub webhook ─────────────────────────────────────────────────────────
  fastify.post<{ Params: { appId: string } }>(
    '/github/:appId',
    async (request, reply) => {
      const { appId } = request.params;
      const app = await db.query.applications.findFirst({
        where: eq(schema.applications.id, appId),
      });

      if (!app) return reply.code(404).send({ error: 'App not found' });
      if (!app.autoDeploy) return reply.code(200).send({ ok: false, reason: 'autoDeploy disabled' });

      // Validate HMAC signature using JSON string body
      const sig = (request.headers['x-hub-signature-256'] as string) ?? '';
      const secret = app.webhookSecret ?? '';
      const payloadStr = JSON.stringify(request.body);

      if (secret && sig) {
        if (!verifyGitHubSignature(payloadStr, sig, secret)) {
          fastify.log.warn(`GitHub webhook signature mismatch for app ${appId}`);
          return reply.code(403).send({ error: 'Invalid signature' });
        }
      }

      const event = request.headers['x-github-event'] as string;
      if (event !== 'push') {
        return reply.code(200).send({ ok: true, skipped: `event=${event}` });
      }

      const body = request.body as any;
      const pushedBranch = (body?.ref ?? '').replace('refs/heads/', '');
      const appBranch = app.gitBranch ?? app.githubBranch ?? 'main';

      if (pushedBranch && pushedBranch !== appBranch) {
        return reply.code(200).send({ ok: true, skipped: `branch mismatch (push: ${pushedBranch}, app: ${appBranch})` });
      }

      fastify.log.info(`GitHub webhook triggered deployment for ${app.name} (branch: ${pushedBranch})`);

      const deployment = await deployService.deploy(app);
      return reply.code(202).send({ ok: true, deploymentId: deployment.id });
    },
  );

  // ── GitLab webhook ─────────────────────────────────────────────────────────
  fastify.post<{ Params: { appId: string } }>(
    '/gitlab/:appId',
    async (request, reply) => {
      const { appId } = request.params;
      const app = await db.query.applications.findFirst({
        where: eq(schema.applications.id, appId),
      });

      if (!app) return reply.code(404).send({ error: 'App not found' });
      if (!app.autoDeploy) return reply.code(200).send({ ok: false, reason: 'autoDeploy disabled' });

      // Validate token
      const token = (request.headers['x-gitlab-token'] as string) ?? '';
      const secret = app.webhookSecret ?? '';
      if (secret && token && !verifyGitLabToken(token, secret)) {
        return reply.code(403).send({ error: 'Invalid token' });
      }

      const event = request.headers['x-gitlab-event'] as string;
      if (event !== 'Push Hook') {
        return reply.code(200).send({ ok: true, skipped: `event=${event}` });
      }

      const body = request.body as any;
      const pushedBranch = (body?.ref ?? '').replace('refs/heads/', '');
      const appBranch = app.gitBranch ?? 'main';

      if (pushedBranch && pushedBranch !== appBranch) {
        return reply.code(200).send({ ok: true, skipped: `branch mismatch` });
      }

      fastify.log.info(`GitLab webhook triggered deployment for ${app.name}`);
      const deployment = await deployService.deploy(app);
      return reply.code(202).send({ ok: true, deploymentId: deployment.id });
    },
  );

  // ── Health ping (for webhook testing) ─────────────────────────────────────
  fastify.get('/ping', async () => ({ ok: true, ts: new Date().toISOString() }));
}
