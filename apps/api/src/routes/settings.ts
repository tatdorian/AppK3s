import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const ALLOWED_KEYS = ['defaultDomain', 'defaultIngressClass', 'defaultTls'] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

function isAllowedKey(k: string): k is SettingKey {
  return ALLOWED_KEYS.includes(k as SettingKey);
}

export async function settingsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // GET /api/settings  → { defaultDomain: '', defaultIngressClass: 'traefik', ... }
  fastify.get('/', auth, async () => {
    const rows = await db.query.settings.findMany();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    // Ensure all keys are present with defaults
    if (!('defaultDomain' in result)) result.defaultDomain = '';
    if (!('defaultIngressClass' in result)) result.defaultIngressClass = 'traefik';
    if (!('defaultTls' in result)) result.defaultTls = 'false';
    return result;
  });

  // PATCH /api/settings  { defaultDomain: 'example.com', ... }
  fastify.patch('/', auth, async (request, reply) => {
    const body = request.body as Record<string, string>;
    if (typeof body !== 'object' || body === null) {
      return reply.code(400).send({ error: 'Invalid body' });
    }

    const updates: Promise<unknown>[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (!isAllowedKey(key)) continue;
      if (typeof value !== 'string') continue;
      updates.push(
        db
          .insert(schema.settings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.settings.key,
            set: { value, updatedAt: new Date() },
          }),
      );
    }

    await Promise.all(updates);

    // Return updated settings
    const rows = await db.query.settings.findMany();
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  });
}
