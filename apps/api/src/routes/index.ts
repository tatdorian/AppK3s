import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { appsRoutes } from './apps.js';
import { logsRoutes } from './logs.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(appsRoutes, { prefix: '/api/apps' });
  await app.register(logsRoutes, { prefix: '/api/apps' });
}
