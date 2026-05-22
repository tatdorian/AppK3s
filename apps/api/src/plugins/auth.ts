import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';

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
    try {
      await request.jwtVerify();
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, request.user.sub),
      });
      if (!user) {
        reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' });
    }
  });
}

export default fp(authPlugin);
