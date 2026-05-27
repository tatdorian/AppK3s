import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import { hashApiKey } from '../lib/crypto.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: any) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/jwt'), {
    secret: config.jwtSecret,
    sign: { expiresIn: '7d' },
  });

  app.decorate('authenticate', async function (request: FastifyRequest, reply: any) {
    // ── 1. Try JWT verification first ────────────────────────────────────────
    try {
      await request.jwtVerify();
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, request.user.sub),
      });
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
      }
      return; // JWT auth succeeded
    } catch {
      // JWT failed — fall through to API key check
    }

    // ── 2. Try API key auth ───────────────────────────────────────────────────
    const authHeader = request.headers['authorization'];
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    let rawKey: string | undefined;

    // Support: Authorization: Bearer ak_... OR X-API-Key: ak_...
    if (apiKeyHeader?.startsWith('ak_')) {
      rawKey = apiKeyHeader;
    } else if (authHeader?.startsWith('Bearer ak_')) {
      rawKey = authHeader.slice('Bearer '.length);
    }

    if (!rawKey) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' });
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await db.query.apiKeys.findFirst({
      where: eq(schema.apiKeys.keyHash, keyHash),
    });

    if (!apiKey) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API key' });
    }

    // Check expiry
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'API key expired' });
    }

    // Load user
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, apiKey.userId),
    });
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
    }

    // Update last_used_at (fire and forget)
    db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, apiKey.id))
      .catch(() => {/* ignore */});

    // Set request.user to match JWT payload shape
    request.user = { sub: user.id, email: user.email, role: user.role };
  });
}

export default fp(authPlugin);
