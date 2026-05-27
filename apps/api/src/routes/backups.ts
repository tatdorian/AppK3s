import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { z } from 'zod';

const s3ConfigSchema = z.object({
  bucket: z.string().min(1),
  region: z.string().min(1),
  endpoint: z.string().optional(),
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
  prefix: z.string().optional(),
});

const createBackupConfigSchema = z.object({
  appId: z.string().uuid(),
  name: z.string().min(1).max(100),
  schedule: z.string().min(1).max(100), // cron expression
  destination: z.enum(['local', 's3']),
  s3Config: s3ConfigSchema.optional(),
  localPath: z.string().optional(),
  retentionDays: z.number().int().min(1).max(365).default(30),
  enabled: z.boolean().default(true),
});

const updateBackupConfigSchema = createBackupConfigSchema.partial().omit({ appId: true });

async function canAccessApp(userId: string, role: string, appId: string): Promise<boolean> {
  if (role === 'admin') return true;

  const membership = await db.query.appPermissions.findFirst({
    where: and(
      eq(schema.appPermissions.appId, appId),
      eq(schema.appPermissions.userId, userId),
    ),
  });
  return !!membership;
}

export async function backupsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/backups ───────────────────────────────────────────────────────
  fastify.get('/', auth, async (request) => {
    const { sub: userId, role } = request.user;

    if (role === 'admin') {
      return db.query.backupConfigs.findMany({
        orderBy: [desc(schema.backupConfigs.createdAt)],
      });
    }

    // Non-admin: return configs for apps the user has access to
    const memberships = await db.query.appPermissions.findMany({
      where: eq(schema.appPermissions.userId, userId),
      columns: { appId: true },
    });

    if (memberships.length === 0) return [];

    const appIds = memberships.map((m) => m.appId);
    const { inArray } = await import('drizzle-orm');

    return db.query.backupConfigs.findMany({
      where: inArray(schema.backupConfigs.appId, appIds),
      orderBy: [desc(schema.backupConfigs.createdAt)],
    });
  });

  // ── POST /api/backups ──────────────────────────────────────────────────────
  fastify.post('/', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const body = createBackupConfigSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    // Verify access to the app
    if (!(await canAccessApp(userId, role, body.data.appId))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied to this application' });
    }

    if (body.data.destination === 's3' && !body.data.s3Config) {
      return reply.code(400).send({ error: 'Validation', message: 's3Config is required for S3 destination' });
    }

    const [created] = await db
      .insert(schema.backupConfigs)
      .values({
        appId: body.data.appId,
        name: body.data.name,
        schedule: body.data.schedule,
        destination: body.data.destination,
        s3Config: body.data.s3Config ?? null,
        localPath: body.data.localPath ?? null,
        retentionDays: body.data.retentionDays,
        enabled: body.data.enabled,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ── PATCH /api/backups/:id ─────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const existing = await db.query.backupConfigs.findFirst({
      where: eq(schema.backupConfigs.id, request.params.id),
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Backup config not found' });
    }

    // Verify access to the app
    if (!(await canAccessApp(userId, role, existing.appId))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    const body = updateBackupConfigSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const [updated] = await db
      .update(schema.backupConfigs)
      .set(body.data)
      .where(eq(schema.backupConfigs.id, request.params.id))
      .returning();

    return updated;
  });

  // ── DELETE /api/backups/:id ────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const existing = await db.query.backupConfigs.findFirst({
      where: eq(schema.backupConfigs.id, request.params.id),
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Backup config not found' });
    }

    if (!(await canAccessApp(userId, role, existing.appId))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    await db.delete(schema.backupConfigs).where(eq(schema.backupConfigs.id, request.params.id));

    return reply.code(204).send();
  });

  // ── GET /api/backups/:id/runs ──────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/runs', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const config = await db.query.backupConfigs.findFirst({
      where: eq(schema.backupConfigs.id, request.params.id),
    });

    if (!config) {
      return reply.code(404).send({ error: 'Not Found', message: 'Backup config not found' });
    }

    if (!(await canAccessApp(userId, role, config.appId))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    const runs = await db.query.backupRuns.findMany({
      where: eq(schema.backupRuns.configId, request.params.id),
      orderBy: [desc(schema.backupRuns.createdAt)],
      limit: 50,
    });

    return runs;
  });

  // ── POST /api/backups/:id/run ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/run', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const config = await db.query.backupConfigs.findFirst({
      where: eq(schema.backupConfigs.id, request.params.id),
    });

    if (!config) {
      return reply.code(404).send({ error: 'Not Found', message: 'Backup config not found' });
    }

    if (!(await canAccessApp(userId, role, config.appId))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    // Enqueue backup job via BullMQ
    try {
      const { getBackupQueue } = await import('../workers/backup.worker.js');
      const queue = getBackupQueue();
      await queue.add('backup', { configId: config.id }, { attempts: 3 });
      return reply.code(202).send({ ok: true, message: 'Backup job enqueued' });
    } catch (err: any) {
      fastify.log.error(`Failed to enqueue backup job: ${err.message}`);
      return reply.code(500).send({ error: 'InternalError', message: 'Failed to enqueue backup job' });
    }
  });
}
