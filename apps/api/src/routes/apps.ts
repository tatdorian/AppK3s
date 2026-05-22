import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createAppSchema, updateAppSchema } from '@appk3s/shared';
import { DeploymentService } from '../services/deployment.service.js';
import { KubernetesService } from '../services/kubernetes.service.js';

const k8s = new KubernetesService();
const deployService = new DeploymentService(k8s);

export async function appsRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  // GET /api/apps
  app.get('/', auth, async () => {
    return db.query.applications.findMany({
      orderBy: [desc(schema.applications.createdAt)],
    });
  });

  // GET /api/apps/:id
  app.get<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const app = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!app) return reply.code(404).send({ error: 'Not Found', message: 'Application not found' });
    return app;
  });

  // POST /api/apps
  app.post('/', auth, async (request, reply) => {
    const body = createAppSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const { type, image, composeContent } = body.data;
    if (type === 'docker-image' && !image) {
      return reply
        .code(400)
        .send({ error: 'Validation', message: 'image is required for docker-image type' });
    }
    if (type === 'compose' && !composeContent) {
      return reply
        .code(400)
        .send({ error: 'Validation', message: 'composeContent is required for compose type' });
    }

    const [created] = await db.insert(schema.applications).values(body.data).returning();
    return reply.code(201).send(created);
  });

  // PATCH /api/apps/:id
  app.patch<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const existing = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!existing) return reply.code(404).send({ error: 'Not Found' });

    const body = updateAppSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const [updated] = await db
      .update(schema.applications)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(schema.applications.id, request.params.id))
      .returning();

    return updated;
  });

  // DELETE /api/apps/:id
  app.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const existing = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!existing) return reply.code(404).send({ error: 'Not Found' });

    await deployService.delete(existing);
    await db.delete(schema.applications).where(eq(schema.applications.id, request.params.id));
    return reply.code(204).send();
  });

  // POST /api/apps/:id/deploy
  app.post<{ Params: { id: string } }>('/:id/deploy', auth, async (request, reply) => {
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    const deployment = await deployService.deploy(application);
    return reply.code(202).send(deployment);
  });

  // POST /api/apps/:id/start
  app.post<{ Params: { id: string } }>('/:id/start', auth, async (request, reply) => {
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });
    await deployService.start(application);
    return { ok: true };
  });

  // POST /api/apps/:id/stop
  app.post<{ Params: { id: string } }>('/:id/stop', auth, async (request, reply) => {
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });
    await deployService.stop(application);
    return { ok: true };
  });

  // POST /api/apps/:id/restart
  app.post<{ Params: { id: string } }>('/:id/restart', auth, async (request, reply) => {
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });
    await deployService.restart(application);
    return { ok: true };
  });

  // GET /api/apps/:id/status
  app.get<{ Params: { id: string } }>('/:id/status', auth, async (request, reply) => {
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    try {
      const status = await k8s.getDeploymentStatus(application);
      return status;
    } catch {
      return { availableReplicas: 0, desiredReplicas: 0, readyReplicas: 0, pods: [] };
    }
  });

  // GET /api/apps/:id/deployments
  app.get<{ Params: { id: string } }>('/:id/deployments', auth, async (request, reply) => {
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    return db.query.deployments.findMany({
      where: eq(schema.deployments.applicationId, request.params.id),
      orderBy: [desc(schema.deployments.createdAt)],
      limit: 20,
    });
  });
}
