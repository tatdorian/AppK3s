import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { generateApiKey } from '../lib/crypto.js';
import { z } from 'zod';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export async function apiKeysRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/auth/api-keys ─────────────────────────────────────────────────
  fastify.get('/', auth, async (request) => {
    const { sub: userId } = request.user;

    const keys = await db.query.apiKeys.findMany({
      where: eq(schema.apiKeys.userId, userId),
      columns: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        // keyHash is intentionally omitted
        userId: false,
        keyHash: false,
      },
    });

    return keys;
  });

  // ── POST /api/auth/api-keys ────────────────────────────────────────────────
  fastify.post('/', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const body = createApiKeySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const { key, hash, prefix } = generateApiKey();

    const expiresAt = body.data.expiresAt ? new Date(body.data.expiresAt) : undefined;

    const [created] = await db
      .insert(schema.apiKeys)
      .values({
        userId,
        name: body.data.name,
        keyHash: hash,
        keyPrefix: prefix,
        ...(expiresAt ? { expiresAt } : {}),
      })
      .returning({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        keyPrefix: schema.apiKeys.keyPrefix,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        expiresAt: schema.apiKeys.expiresAt,
        createdAt: schema.apiKeys.createdAt,
      });

    // Return the full key ONCE — it will never be shown again
    return reply.code(201).send({ ...created, key });
  });

  // ── DELETE /api/auth/api-keys/:id ──────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const existing = await db.query.apiKeys.findFirst({
      where: eq(schema.apiKeys.id, request.params.id),
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'API key not found' });
    }

    // Only owner of the key or admin can revoke
    if (existing.userId !== userId && role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    await db.delete(schema.apiKeys).where(
      and(eq(schema.apiKeys.id, request.params.id)),
    );

    return reply.code(204).send();
  });
}
