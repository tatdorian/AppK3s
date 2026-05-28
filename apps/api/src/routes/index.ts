import type { FastifyInstance } from 'fastify';
import { authRoutes }          from './auth.js';
import { appsRoutes }          from './apps.js';
import { logsRoutes }          from './logs.js';
import { nodesRoutes }         from './nodes.js';
import { settingsRoutes }      from './settings.js';
import { usersRoutes }         from './users.js';
import { templatesRoutes }     from './templates.js';
import { projectsRoutes }      from './projects.js';
import { apiKeysRoutes }       from './api-keys.js';
import { terminalRoutes }      from './terminal.js';
import { notificationsRoutes } from './notifications.js';
import { monitoringRoutes }    from './monitoring.js';
import { backupsRoutes }       from './backups.js';
import { gitRoutes }           from './git.js';
import { webhooksRoutes }      from './webhooks.js';
import { githubAppRoutes }     from './github-app.js';
import { s3Routes }            from './s3.js';

export async function registerRoutes(app: FastifyInstance) {
  // ── Core ──────────────────────────────────────────────────────────────────
  await app.register(authRoutes,          { prefix: '/api/auth' });
  await app.register(appsRoutes,          { prefix: '/api/apps' });
  await app.register(logsRoutes,          { prefix: '/api/apps' });
  await app.register(nodesRoutes,         { prefix: '/api/nodes' });
  await app.register(settingsRoutes,      { prefix: '/api/settings' });
  await app.register(usersRoutes,         { prefix: '/api/users' });
  await app.register(templatesRoutes,     { prefix: '/api/templates' });
  await app.register(projectsRoutes,      { prefix: '/api/projects' });

  // ── Extended features ─────────────────────────────────────────────────────
  await app.register(apiKeysRoutes,       { prefix: '/api/auth/api-keys' });
  await app.register(terminalRoutes,      { prefix: '/api/apps' });
  await app.register(notificationsRoutes, { prefix: '/api/notifications' });
  await app.register(monitoringRoutes,    { prefix: '/api/monitoring' });
  await app.register(backupsRoutes,       { prefix: '/api/backups' });

  // ── Coolify-like Git deployment ───────────────────────────────────────────
  await app.register(gitRoutes,           { prefix: '/api/git' });
  await app.register(webhooksRoutes,      { prefix: '/api/webhooks' });
  await app.register(githubAppRoutes,     { prefix: '/api/github-app' });
  await app.register(s3Routes,            { prefix: '/api/s3' });
}
