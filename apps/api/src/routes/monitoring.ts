import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { KubernetesService } from '../services/kubernetes.service.js';
import { z } from 'zod';

const k8s = new KubernetesService();

const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  metric: z.enum(['cpu_percent', 'memory_percent', 'pod_restarts']),
  operator: z.enum(['gt', 'lt']),
  threshold: z.number(),
  durationMinutes: z.number().int().min(1).default(5),
  appId: z.string().uuid().optional(),
  enabled: z.boolean().default(true),
});

const updateAlertSchema = createAlertSchema.partial();

// Helper: parse Kubernetes resource quantity to a number
function parseCpuMillicores(cpu: string | null | undefined): number {
  if (!cpu) return 0;
  if (cpu.endsWith('m')) return parseInt(cpu.slice(0, -1), 10);
  return parseFloat(cpu) * 1000;
}

function parseMemoryBytes(mem: string | null | undefined): number {
  if (!mem) return 0;
  if (mem.endsWith('Ki')) return parseInt(mem.slice(0, -2), 10) * 1024;
  if (mem.endsWith('Mi')) return parseInt(mem.slice(0, -2), 10) * 1024 * 1024;
  if (mem.endsWith('Gi')) return parseInt(mem.slice(0, -2), 10) * 1024 * 1024 * 1024;
  return parseInt(mem, 10);
}

export async function monitoringRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/monitoring/metrics/nodes ─────────────────────────────────────
  fastify.get('/metrics/nodes', auth, async (_request, reply) => {
    try {
      const nodes = await k8s.listNodes();
      return nodes.map((node) => {
        const cpuAllocMillicores = parseCpuMillicores(node.cpuAllocatable);
        const cpuUsageMillicores = parseCpuMillicores(node.cpuUsage);
        const memAllocBytes = parseMemoryBytes(node.memoryAllocatable);
        const memUsageBytes = parseMemoryBytes(node.memoryUsage);

        return {
          name: node.name,
          roles: node.roles,
          ready: node.ready,
          cpuUsage: node.cpuUsage,
          memoryUsage: node.memoryUsage,
          cpuAllocatable: node.cpuAllocatable,
          memoryAllocatable: node.memoryAllocatable,
          cpuPercent: cpuAllocMillicores > 0
            ? Math.round((cpuUsageMillicores / cpuAllocMillicores) * 100)
            : null,
          memoryPercent: memAllocBytes > 0
            ? Math.round((memUsageBytes / memAllocBytes) * 100)
            : null,
        };
      });
    } catch (err: any) {
      return reply.code(500).send({ error: 'KubernetesError', message: err.message });
    }
  });

  // ── GET /api/monitoring/metrics/apps/:id ──────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/metrics/apps/:id', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) {
      return reply.code(404).send({ error: 'Not Found', message: 'Application not found' });
    }

    if (role !== 'admin') {
      const membership = await db.query.appPermissions.findFirst({
        where: and(
          eq(schema.appPermissions.appId, application.id),
          eq(schema.appPermissions.userId, userId),
        ),
      });
      if (!membership) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
      }
    }

    try {
      const pods = await k8s.listPods(application);
      return {
        appId: application.id,
        appName: application.name,
        pods: pods.map((pod) => ({
          name: pod.name,
          phase: pod.phase,
          ready: pod.ready,
          restarts: pod.restarts,
          age: pod.age,
          node: pod.node,
        })),
        totalPods: pods.length,
        runningPods: pods.filter((p) => p.phase === 'Running').length,
        totalRestarts: pods.reduce((sum, p) => sum + p.restarts, 0),
      };
    } catch (err: any) {
      return reply.code(500).send({ error: 'KubernetesError', message: err.message });
    }
  });

  // ── GET /api/monitoring/alerts ────────────────────────────────────────────
  fastify.get('/alerts', auth, async (request) => {
    const { sub: userId } = request.user;

    return db.query.alertRules.findMany({
      where: eq(schema.alertRules.userId, userId),
    });
  });

  // ── POST /api/monitoring/alerts ───────────────────────────────────────────
  fastify.post('/alerts', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const body = createAlertSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    // If appId provided, verify user has access to the app
    if (body.data.appId) {
      const app = await db.query.applications.findFirst({
        where: eq(schema.applications.id, body.data.appId),
      });
      if (!app) {
        return reply.code(404).send({ error: 'Not Found', message: 'Application not found' });
      }
    }

    const [created] = await db
      .insert(schema.alertRules)
      .values({
        userId,
        name: body.data.name,
        metric: body.data.metric,
        operator: body.data.operator,
        threshold: body.data.threshold,
        durationMinutes: body.data.durationMinutes,
        appId: body.data.appId ?? null,
        enabled: body.data.enabled,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ── PATCH /api/monitoring/alerts/:id ──────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>('/alerts/:id', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const existing = await db.query.alertRules.findFirst({
      where: and(
        eq(schema.alertRules.id, request.params.id),
        eq(schema.alertRules.userId, userId),
      ),
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Alert rule not found' });
    }

    const body = updateAlertSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const [updated] = await db
      .update(schema.alertRules)
      .set(body.data)
      .where(
        and(
          eq(schema.alertRules.id, request.params.id),
          eq(schema.alertRules.userId, userId),
        ),
      )
      .returning();

    return updated;
  });

  // ── DELETE /api/monitoring/alerts/:id ─────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/alerts/:id', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const existing = await db.query.alertRules.findFirst({
      where: and(
        eq(schema.alertRules.id, request.params.id),
        eq(schema.alertRules.userId, userId),
      ),
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Alert rule not found' });
    }

    await db.delete(schema.alertRules).where(
      and(
        eq(schema.alertRules.id, request.params.id),
        eq(schema.alertRules.userId, userId),
      ),
    );

    return reply.code(204).send();
  });
}
