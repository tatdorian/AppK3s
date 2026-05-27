import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { z } from 'zod';

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['email', 'webhook', 'discord', 'slack']),
  config: z.record(z.string()),
  events: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

const updateChannelSchema = createChannelSchema.partial();

export async function notificationsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/notifications/channels ──────────────────────────────────────
  fastify.get('/channels', auth, async (request) => {
    const { sub: userId } = request.user;

    return db.query.notificationChannels.findMany({
      where: eq(schema.notificationChannels.userId, userId),
    });
  });

  // ── POST /api/notifications/channels ─────────────────────────────────────
  fastify.post('/channels', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const body = createChannelSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const [created] = await db
      .insert(schema.notificationChannels)
      .values({
        userId,
        name: body.data.name,
        type: body.data.type,
        config: body.data.config,
        events: body.data.events,
        enabled: body.data.enabled,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ── PATCH /api/notifications/channels/:id ─────────────────────────────────
  fastify.patch<{ Params: { id: string } }>('/channels/:id', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const existing = await db.query.notificationChannels.findFirst({
      where: and(
        eq(schema.notificationChannels.id, request.params.id),
        eq(schema.notificationChannels.userId, userId),
      ),
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notification channel not found' });
    }

    const body = updateChannelSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const [updated] = await db
      .update(schema.notificationChannels)
      .set(body.data)
      .where(
        and(
          eq(schema.notificationChannels.id, request.params.id),
          eq(schema.notificationChannels.userId, userId),
        ),
      )
      .returning();

    return updated;
  });

  // ── DELETE /api/notifications/channels/:id ────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/channels/:id', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const existing = await db.query.notificationChannels.findFirst({
      where: and(
        eq(schema.notificationChannels.id, request.params.id),
        eq(schema.notificationChannels.userId, userId),
      ),
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notification channel not found' });
    }

    await db.delete(schema.notificationChannels).where(
      and(
        eq(schema.notificationChannels.id, request.params.id),
        eq(schema.notificationChannels.userId, userId),
      ),
    );

    return reply.code(204).send();
  });

  // ── POST /api/notifications/channels/test-smtp ───────────────────────────
  // Sends a test email using the globally configured SMTP settings (from Settings page).
  // Called directly — no channel record required.
  fastify.post('/channels/test-smtp', auth, async (request, reply) => {
    const body = request.body as { email?: string };
    const email = body?.email?.trim();
    if (!email) {
      return reply.code(400).send({ error: 'Bad Request', message: 'email is required' });
    }

    try {
      const { sendMail } = await import('../services/email.service.js');
      await sendMail({
        to: email,
        subject: 'Test SMTP — AppK3s',
        html: '<h2>SMTP configuration test</h2><p>If you received this email, your SMTP configuration is working correctly.</p>',
        text: 'SMTP configuration test — AppK3s is working correctly.',
      });
      return { ok: true };
    } catch (err: any) {
      return reply.code(500).send({ error: 'SmtpError', message: err.message });
    }
  });

  // ── POST /api/notifications/channels/:id/test ─────────────────────────────
  fastify.post<{ Params: { id: string } }>('/channels/:id/test', auth, async (request, reply) => {
    const { sub: userId } = request.user;

    const channel = await db.query.notificationChannels.findFirst({
      where: and(
        eq(schema.notificationChannels.id, request.params.id),
        eq(schema.notificationChannels.userId, userId),
      ),
    });

    if (!channel) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notification channel not found' });
    }

    try {
      if (channel.type === 'email') {
        const { sendMail } = await import('../services/email.service.js');
        const email = (channel.config as Record<string, string>).email;
        if (!email) {
          return reply.code(400).send({ error: 'Bad Request', message: 'Email address not configured' });
        }
        await sendMail({
          to: email,
          subject: 'Test notification — AppK3s',
          html: '<h2>Test</h2><p>This is a test notification from AppK3s.</p>',
          text: 'Test notification from AppK3s.',
        });
      } else if (['webhook', 'discord', 'slack'].includes(channel.type)) {
        const url = (channel.config as Record<string, string>).url;
        if (!url) {
          return reply.code(400).send({ error: 'Bad Request', message: 'Webhook URL not configured' });
        }
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'test',
            message: 'Test notification from AppK3s',
            timestamp: new Date().toISOString(),
          }),
        });
        if (!res.ok) {
          return reply.code(502).send({ error: 'Bad Gateway', message: `Webhook returned ${res.status}` });
        }
      }

      return { ok: true };
    } catch (err: any) {
      return reply.code(500).send({ error: 'InternalError', message: err.message });
    }
  });
}
