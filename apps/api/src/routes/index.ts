import type { FastifyInstance } from 'fastify';
import { authRoutes }     from './auth.js';
import { appsRoutes }     from './apps.js';
import { logsRoutes }     from './logs.js';
import { nodesRoutes }    from './nodes.js';
import { settingsRoutes } from './settings.js';
import { usersRoutes }    from './users.js';
import { templatesRoutes }from './templates.js';
import { projectsRoutes } from './projects.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes,     { prefix: '/api/auth' });
  await app.register(appsRoutes,     { prefix: '/api/apps' });
  await app.register(logsRoutes,     { prefix: '/api/apps' });
  await app.register(nodesRoutes,    { prefix: '/api/nodes' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(usersRoutes,    { prefix: '/api/users' });
  await app.register(templatesRoutes,{ prefix: '/api/templates' });
  await app.register(projectsRoutes, { prefix: '/api/projects' });
}
