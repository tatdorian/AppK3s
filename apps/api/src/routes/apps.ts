import type { FastifyInstance } from 'fastify';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createAppSchema, updateAppSchema, setPermissionSchema } from '@appk3s/shared';
import { DeploymentService } from '../services/deployment.service.js';
import { KubernetesService } from '../services/kubernetes.service.js';

async function getWildcardSettings() {
  const rows = await db.query.settings.findMany();
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return {
    wildcardDomain: s['wildcardDomain'] ?? '',
    defaultTls: s['defaultTls'] === 'true',
  };
}

const k8s = new KubernetesService();
const deployService = new DeploymentService(k8s);

// ─── Permission helpers ───────────────────────────────────────────────────────

/** Returns true if the user can perform the action on this app.
 *  Admins always pass. Viewers need an explicit app_permissions row. */
async function hasPermission(
  userId: string,
  role: string,
  appId: string,
  action: 'view' | 'deploy' | 'edit' | 'delete',
): Promise<boolean> {
  if (role === 'admin') return true;

  const perm = await db.query.appPermissions.findFirst({
    where: and(
      eq(schema.appPermissions.appId, appId),
      eq(schema.appPermissions.userId, userId),
    ),
  });
  if (!perm) return false;
  if (action === 'view')   return perm.canView;
  if (action === 'deploy') return perm.canDeploy;
  if (action === 'edit')   return perm.canEdit;
  if (action === 'delete') return perm.canDelete;
  return false;
}

export async function appsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/apps ──────────────────────────────────────────────────────────
  // Admins → tous les apps. Viewers → seulement les apps où can_view = true.
  fastify.get('/', auth, async (request) => {
    const { sub: userId, role } = request.user;

    if (role === 'admin') {
      return db.query.applications.findMany({
        orderBy: [desc(schema.applications.createdAt)],
      });
    }

    // Pour les viewers : récupérer les IDs d'apps autorisés
    const perms = await db.query.appPermissions.findMany({
      where: and(
        eq(schema.appPermissions.userId, userId),
        eq(schema.appPermissions.canView, true),
      ),
    });
    if (perms.length === 0) return [];

    return db.query.applications.findMany({
      where: inArray(schema.applications.id, perms.map((p) => p.appId)),
      orderBy: [desc(schema.applications.createdAt)],
    });
  });

  // ── GET /api/apps/:id ──────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found', message: 'Application not found' });

    if (!(await hasPermission(userId, role, application.id, 'view'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }
    return application;
  });

  // ── POST /api/apps ─────────────────────────────────────────────────────────
  fastify.post('/', auth, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
    }

    const body = createAppSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const { type, image, composeContent } = body.data;
    if (type === 'docker-image' && !image) {
      return reply.code(400).send({ error: 'Validation', message: 'image is required for docker-image type' });
    }
    if (type === 'compose' && !composeContent) {
      return reply.code(400).send({ error: 'Validation', message: 'composeContent is required for compose type' });
    }

    const wc = await getWildcardSettings();
    const data = {
      ...body.data,
      subdomain: body.data.subdomain || body.data.name,
      domain:    body.data.domain    || wc.wildcardDomain || undefined,
      tlsEnabled: body.data.tlsEnabled ?? (wc.defaultTls && !!wc.wildcardDomain),
    };

    const [created] = await db.insert(schema.applications).values(data).returning();
    return reply.code(201).send(created);
  });

  // ── PATCH /api/apps/:id ────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const existing = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!existing) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, existing.id, 'edit'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    const body = updateAppSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    if (body.data.name && body.data.name !== existing.name) {
      try { await k8s.deleteApp(existing); } catch (err) {
        fastify.log.warn(`Could not remove old k8s resources for ${existing.name}: ${err}`);
      }
    }

    const [updated] = await db
      .update(schema.applications)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(schema.applications.id, request.params.id))
      .returning();

    return updated;
  });

  // ── DELETE /api/apps/:id ───────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const existing = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!existing) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, existing.id, 'delete'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    await deployService.delete(existing);
    await db.delete(schema.applications).where(eq(schema.applications.id, request.params.id));
    return reply.code(204).send();
  });

  // ── POST /api/apps/:id/deploy ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/deploy', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, application.id, 'deploy'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    const deployment = await deployService.deploy(application);
    return reply.code(202).send(deployment);
  });

  // ── POST /api/apps/:id/start ───────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/start', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, application.id, 'deploy'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }
    await deployService.start(application);
    return { ok: true };
  });

  // ── POST /api/apps/:id/stop ────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/stop', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, application.id, 'deploy'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }
    await deployService.stop(application);
    return { ok: true };
  });

  // ── POST /api/apps/:id/restart ─────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/restart', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, application.id, 'deploy'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }
    await deployService.restart(application);
    return { ok: true };
  });

  // ── GET /api/apps/:id/status ───────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/status', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, application.id, 'view'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    try {
      const status = await k8s.getDeploymentStatus(application);
      return status;
    } catch {
      return { availableReplicas: 0, desiredReplicas: 0, readyReplicas: 0, pods: [] };
    }
  });

  // ── GET /api/apps/:id/deployments ──────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/deployments', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await hasPermission(userId, role, application.id, 'view'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    return db.query.deployments.findMany({
      where: eq(schema.deployments.applicationId, request.params.id),
      orderBy: [desc(schema.deployments.createdAt)],
      limit: 20,
    });
  });

  // ── GET /api/apps/:id/permissions (admin only) ─────────────────────────────
  // Retourne la liste de tous les non-admins avec leurs droits sur cet app.
  fastify.get<{ Params: { id: string } }>('/:id/permissions', auth, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
    }

    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    // Tous les utilisateurs non-admin
    const allUsers = await db.query.users.findMany({
      columns: { id: true, email: true, role: true },
    });
    const nonAdmins = allUsers.filter((u) => u.role !== 'admin');

    // Permissions existantes pour cet app
    const perms = await db.query.appPermissions.findMany({
      where: eq(schema.appPermissions.appId, request.params.id),
    });
    const permMap = new Map(perms.map((p) => [p.userId, p]));

    // Fusion : un entry par utilisateur non-admin (avec ou sans perm existante)
    return nonAdmins.map((u) => {
      const perm = permMap.get(u.id);
      return {
        userId:    u.id,
        email:     u.email,
        role:      u.role,
        canView:   perm?.canView   ?? false,
        canDeploy: perm?.canDeploy ?? false,
        canEdit:   perm?.canEdit   ?? false,
        canDelete: perm?.canDelete ?? false,
        permId:    perm?.id ?? null,
      };
    });
  });

  // ── PUT /api/apps/:id/permissions/:userId (admin only) ─────────────────────
  // Crée ou met à jour les droits d'un utilisateur sur un app.
  fastify.put<{ Params: { id: string; userId: string } }>(
    '/:id/permissions/:userId',
    auth,
    async (request, reply) => {
      if (request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
      }

      const body = setPermissionSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
      }

      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, request.params.id),
      });
      if (!application) return reply.code(404).send({ error: 'Not Found', message: 'App not found' });

      const targetUser = await db.query.users.findFirst({
        where: eq(schema.users.id, request.params.userId),
      });
      if (!targetUser) return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
      if (targetUser.role === 'admin') {
        return reply.code(400).send({ error: 'Bad Request', message: 'Admins already have full access' });
      }

      const [perm] = await db
        .insert(schema.appPermissions)
        .values({
          appId:     request.params.id,
          userId:    request.params.userId,
          canView:   body.data.canView,
          canDeploy: body.data.canDeploy,
          canEdit:   body.data.canEdit,
          canDelete: body.data.canDelete,
        })
        .onConflictDoUpdate({
          target: [schema.appPermissions.appId, schema.appPermissions.userId],
          set: {
            canView:   body.data.canView,
            canDeploy: body.data.canDeploy,
            canEdit:   body.data.canEdit,
            canDelete: body.data.canDelete,
          },
        })
        .returning();

      return perm;
    },
  );

  // ── DELETE /api/apps/:id/permissions/:userId (admin only) ──────────────────
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/permissions/:userId',
    auth,
    async (request, reply) => {
      if (request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
      }

      await db.delete(schema.appPermissions).where(
        and(
          eq(schema.appPermissions.appId,   request.params.id),
          eq(schema.appPermissions.userId,  request.params.userId),
        ),
      );
      return reply.code(204).send();
    },
  );
}
