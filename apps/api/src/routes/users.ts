import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq, ne } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export async function usersRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  const auth = { preHandler: fastify.authenticate };

  // GET /api/users — admin only
  fastify.get('/', auth, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
    const users = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(schema.users.createdAt);
    return users;
  });

  // POST /api/users — admin creates a new user
  fastify.post<{
    Body: { email: string; password: string; role?: 'admin' | 'viewer' };
  }>('/', auth, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
    const { email, password, role = 'viewer' } = request.body as {
      email: string;
      password: string;
      role?: 'admin' | 'viewer';
    };
    if (!email || !password) {
      return reply.code(400).send({ error: 'Validation', message: 'email and password required' });
    }
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Email already in use' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash, role })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      });
    return reply.code(201).send(user);
  });

  // PATCH /api/users/:id — admin changes role, or self changes password
  fastify.patch<{
    Params: { id: string };
    Body: { email?: string; role?: 'admin' | 'viewer'; password?: string; currentPassword?: string };
  }>('/:id', auth, async (request, reply) => {
    const { id } = request.params;
    const { email, role, password, currentPassword } = request.body as {
      email?: string;
      role?: 'admin' | 'viewer';
      password?: string;
      currentPassword?: string;
    };
    const isAdmin = request.user.role === 'admin';
    const isSelf = request.user.sub === id;

    if (!isAdmin && !isSelf) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const target = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
    if (!target) return reply.code(404).send({ error: 'Not Found' });

    // Email change: self or admin; must not already be taken
    if (email !== undefined) {
      if (!isAdmin && !isSelf) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
      if (email !== target.email) {
        const taken = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
        if (taken) {
          return reply.code(409).send({ error: 'Conflict', message: 'Cette adresse email est déjà utilisée' });
        }
        await db.update(schema.users).set({ email }).where(eq(schema.users.id, id));
      }
    }

    // Role change: admin only
    if (role !== undefined) {
      if (!isAdmin) return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
      await db.update(schema.users).set({ role }).where(eq(schema.users.id, id));
    }

    // Password change
    if (password) {
      if (password.length < 8) {
        return reply.code(400).send({ error: 'Validation', message: 'Le mot de passe doit comporter au moins 8 caractères' });
      }
      // Non-admin users must verify their current password,
      // UNLESS mustChangePassword is true (forced change flow — they already authenticated).
      if (!isAdmin && isSelf && !target.mustChangePassword) {
        if (!currentPassword) {
          return reply.code(400).send({ error: 'Validation', message: 'currentPassword required' });
        }
        const ok = await bcrypt.compare(currentPassword, target.passwordHash);
        if (!ok) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Mot de passe actuel incorrect' });
        }
      }
      const passwordHash = await bcrypt.hash(password, 12);
      // Clear the mustChangePassword flag after a successful password change
      await db.update(schema.users)
        .set({ passwordHash, mustChangePassword: false })
        .where(eq(schema.users.id, id));
    }

    const [updated] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        mustChangePassword: schema.users.mustChangePassword,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    return updated;
  });

  // DELETE /api/users/:id — admin only, cannot delete yourself
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
    if (request.user.sub === request.params.id) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', message: 'Cannot delete your own account' });
    }
    const deleted = await db
      .delete(schema.users)
      .where(eq(schema.users.id, request.params.id))
      .returning({ id: schema.users.id });
    if (!deleted.length) return reply.code(404).send({ error: 'Not Found' });
    return reply.code(204).send();
  });
}
