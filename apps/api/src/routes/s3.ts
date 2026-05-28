/**
 * S3 Storage routes — /api/s3
 * Super-admin only for all operations
 */
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { encryptS3, decryptS3, testS3Connection } from '../services/s3.service.js';

export async function s3Routes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── Guard: super-admin only ─────────────────────────────────────────────────
  function requireSuperAdmin(role: string, reply: any) {
    if (role !== 'super-admin' && role !== 'admin') {
      reply.code(403).send({ error: 'Forbidden', message: 'Super-admin requis' });
      return false;
    }
    return true;
  }

  // ── GET /api/s3 — list all storages (all authenticated users) ────────────────
  fastify.get('/', auth, async (request, _reply) => {
    // All authenticated users can list storages (no secrets returned)

    const rows = await db.select().from(schema.s3Storages).orderBy(schema.s3Storages.createdAt);

    // Return without secrets
    return rows.map((r) => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
      endpoint:    r.endpoint,
      region:      r.region,
      bucket:      r.bucket,
      pathStyle:   r.pathStyle,
      isDefault:   r.isDefault,
      createdBy:   r.createdBy,
      createdAt:   r.createdAt,
      updatedAt:   r.updatedAt,
    }));
  });

  // ── POST /api/s3 — create storage ───────────────────────────────────────────
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      endpoint: string;
      region?: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      pathStyle?: boolean;
    };
  }>('/', auth, async (request, reply) => {
    if (!requireSuperAdmin(request.user.role, reply)) return;

    const { name, description, endpoint, region = 'us-east-1', bucket, accessKey, secretKey, pathStyle = false } = request.body;

    if (!name || !endpoint || !bucket || !accessKey || !secretKey) {
      return reply.code(400).send({ error: 'Validation', message: 'name, endpoint, bucket, accessKey et secretKey sont requis' });
    }

    const encAccess = encryptS3(accessKey);
    const encSecret = encryptS3(secretKey);

    const [row] = await db.insert(schema.s3Storages).values({
      name,
      description: description ?? null,
      endpoint,
      region,
      bucket,
      accessKey: encAccess,
      secretKey: encSecret,
      pathStyle,
      isDefault: false,
      createdBy: request.user.sub,
    }).returning();

    return reply.code(201).send({
      id: row.id, name: row.name, description: row.description,
      endpoint: row.endpoint, region: row.region, bucket: row.bucket,
      pathStyle: row.pathStyle, isDefault: row.isDefault,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    });
  });

  // ── GET /api/s3/:id — get one (with decrypted keys for editing) ─────────────
  fastify.get<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    if (!requireSuperAdmin(request.user.role, reply)) return;

    const row = await db.query.s3Storages.findFirst({ where: eq(schema.s3Storages.id, request.params.id) });
    if (!row) return reply.code(404).send({ error: 'Not Found' });

    return {
      id: row.id, name: row.name, description: row.description,
      endpoint: row.endpoint, region: row.region, bucket: row.bucket,
      accessKey: decryptS3(row.accessKey),
      secretKey: decryptS3(row.secretKey),
      pathStyle: row.pathStyle, isDefault: row.isDefault,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  });

  // ── PATCH /api/s3/:id — update storage ─────────────────────────────────────
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      endpoint?: string;
      region?: string;
      bucket?: string;
      accessKey?: string;
      secretKey?: string;
      pathStyle?: boolean;
    };
  }>('/:id', auth, async (request, reply) => {
    if (!requireSuperAdmin(request.user.role, reply)) return;

    const row = await db.query.s3Storages.findFirst({ where: eq(schema.s3Storages.id, request.params.id) });
    if (!row) return reply.code(404).send({ error: 'Not Found' });

    const { name, description, endpoint, region, bucket, accessKey, secretKey, pathStyle } = request.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined)        updates.name = name;
    if (description !== undefined) updates.description = description;
    if (endpoint !== undefined)    updates.endpoint = endpoint;
    if (region !== undefined)      updates.region = region;
    if (bucket !== undefined)      updates.bucket = bucket;
    if (accessKey !== undefined)   updates.accessKey = encryptS3(accessKey);
    if (secretKey !== undefined)   updates.secretKey = encryptS3(secretKey);
    if (pathStyle !== undefined)   updates.pathStyle = pathStyle;

    await db.update(schema.s3Storages).set(updates).where(eq(schema.s3Storages.id, request.params.id));

    const updated = await db.query.s3Storages.findFirst({ where: eq(schema.s3Storages.id, request.params.id) });
    return {
      id: updated!.id, name: updated!.name, description: updated!.description,
      endpoint: updated!.endpoint, region: updated!.region, bucket: updated!.bucket,
      pathStyle: updated!.pathStyle, isDefault: updated!.isDefault,
      createdAt: updated!.createdAt, updatedAt: updated!.updatedAt,
    };
  });

  // ── DELETE /api/s3/:id ──────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    if (!requireSuperAdmin(request.user.role, reply)) return;

    const deleted = await db.delete(schema.s3Storages)
      .where(eq(schema.s3Storages.id, request.params.id))
      .returning({ id: schema.s3Storages.id });

    if (!deleted.length) return reply.code(404).send({ error: 'Not Found' });
    return reply.code(204).send();
  });

  // ── POST /api/s3/:id/test — test connection ────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/test', auth, async (request, reply) => {
    if (!requireSuperAdmin(request.user.role, reply)) return;

    const row = await db.query.s3Storages.findFirst({ where: eq(schema.s3Storages.id, request.params.id) });
    if (!row) return reply.code(404).send({ error: 'Not Found' });

    const result = await testS3Connection({
      endpoint: row.endpoint,
      region: row.region,
      bucket: row.bucket,
      accessKey: decryptS3(row.accessKey),
      secretKey: decryptS3(row.secretKey),
      pathStyle: row.pathStyle,
    });

    return result;
  });

  // ── POST /api/s3/test — test without saving ─────────────────────────────────
  fastify.post<{
    Body: {
      endpoint: string;
      region?: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      pathStyle?: boolean;
    };
  }>('/test', auth, async (request, reply) => {
    if (!requireSuperAdmin(request.user.role, reply)) return;

    const { endpoint, region = 'us-east-1', bucket, accessKey, secretKey, pathStyle = false } = request.body;

    if (!endpoint || !bucket || !accessKey || !secretKey) {
      return reply.code(400).send({ error: 'Validation', message: 'endpoint, bucket, accessKey et secretKey requis' });
    }

    const result = await testS3Connection({ endpoint, region, bucket, accessKey, secretKey, pathStyle });
    return result;
  });

  // ── POST /api/s3/:id/set-default ────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/set-default', auth, async (request, reply) => {
    if (!requireSuperAdmin(request.user.role, reply)) return;

    const row = await db.query.s3Storages.findFirst({ where: eq(schema.s3Storages.id, request.params.id) });
    if (!row) return reply.code(404).send({ error: 'Not Found' });

    // Clear existing default
    await db.update(schema.s3Storages).set({ isDefault: false });
    // Set new default
    await db.update(schema.s3Storages)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(schema.s3Storages.id, request.params.id));

    return { ok: true };
  });
}
