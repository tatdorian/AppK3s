import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { loginSchema, registerSchema } from '@appk3s/shared';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.message });
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, body.data.email),
    });

    if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });

  // POST /api/auth/register  (first user only, or admin)
  app.post('/register', async (request, reply) => {
    const body = registerSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.message });
    }

    const count = await db.$count(schema.users);
    if (count > 0) {
      // Require auth for subsequent registrations
      try {
        await request.jwtVerify();
        if (request.user.role !== 'admin') {
          return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
      } catch {
        return reply.code(403).send({ error: 'Forbidden', message: 'Registration closed' });
      }
    }

    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, body.data.email),
    });
    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 12);
    const [user] = await db
      .insert(schema.users)
      .values({ email: body.data.email, passwordHash, role: count === 0 ? 'admin' : 'viewer' })
      .returning({ id: schema.users.id, email: schema.users.email, role: schema.users.role });

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return reply.code(201).send({ token, user });
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, request.user.sub),
      columns: { passwordHash: false },
    });
    return user;
  });
}
