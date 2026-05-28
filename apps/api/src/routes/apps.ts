import type { FastifyInstance } from 'fastify';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createAppSchema, updateAppSchema, inviteMemberSchema, updateMemberRoleSchema } from '@appk3s/shared';
import { DeploymentService } from '../services/deployment.service.js';
import { KubernetesService } from '../services/kubernetes.service.js';
import { generateWebhookSecret } from '../services/builder.service.js';

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

type AppAction = 'view' | 'deploy' | 'edit' | 'delete' | 'manageTeam';

/**
 * Two-layer access model (Dokploy-inspired):
 *  1. Global admin → always passes
 *  2. Project membership → applies to all apps in the project
 *     owner   = full access + team management
 *     member  = deploy + edit (no delete/team)
 *     viewer  = read only
 *  3. Per-app membership (appPermissions) → fine-grained override within a project
 *     owner   = full access + team management
 *     editor  = deploy + edit
 *     viewer  = read only
 */
function isGlobalAdmin(role: string) {
  return role === 'super-admin' || role === 'admin';
}

async function canDo(
  userId: string,
  globalRole: string,
  appId: string,
  action: AppAction,
): Promise<boolean> {
  if (isGlobalAdmin(globalRole)) return true;

  // Fetch app to get projectId
  const app = await db.query.applications.findFirst({
    where: eq(schema.applications.id, appId),
    columns: { id: true, projectId: true },
  });

  // Check project-level access first
  if (app?.projectId) {
    const projMembership = await db.query.projectMembers.findFirst({
      where: and(
        eq(schema.projectMembers.projectId, app.projectId),
        eq(schema.projectMembers.userId, userId),
      ),
    });
    if (projMembership) {
      const r = projMembership.role as 'owner' | 'member' | 'viewer';
      switch (action) {
        case 'view':        return true;
        case 'deploy':      return r === 'owner' || r === 'member';
        case 'edit':        return r === 'owner' || r === 'member';
        case 'delete':      return r === 'owner' || r === 'member'; // members can delete their apps
        case 'manageTeam':  return r === 'owner';
      }
    }
  }

  // Fallback: per-app permission (fine-grained / legacy)
  const appMembership = await db.query.appPermissions.findFirst({
    where: and(
      eq(schema.appPermissions.appId, appId),
      eq(schema.appPermissions.userId, userId),
    ),
  });
  if (!appMembership) return false;

  const role = appMembership.role as 'owner' | 'editor' | 'viewer';
  switch (action) {
    case 'view':        return true;
    case 'deploy':      return role === 'owner' || role === 'editor';
    case 'edit':        return role === 'owner' || role === 'editor';
    case 'delete':      return role === 'owner';
    case 'manageTeam':  return role === 'owner';
    default:            return false;
  }
}

export async function appsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/apps ──────────────────────────────────────────────────────────
  // Admins → tous les apps. Viewers → seulement les apps où ils sont membres.
  fastify.get('/', auth, async (request) => {
    const { sub: userId, role } = request.user;

    if (isGlobalAdmin(role)) {
      return db.query.applications.findMany({
        orderBy: [desc(schema.applications.createdAt)],
      });
    }

    // Non-admin: union of project membership + per-app membership
    const [projMemberships, appMemberships] = await Promise.all([
      db.query.projectMembers.findMany({ where: eq(schema.projectMembers.userId, userId) }),
      db.query.appPermissions.findMany({ where: eq(schema.appPermissions.userId, userId) }),
    ]);

    const accessibleAppIds = new Set<string>();

    // Apps via project membership
    if (projMemberships.length > 0) {
      const projectIds = projMemberships.map((m) => m.projectId);
      const appsInProjects = await db.query.applications.findMany({
        where: (a, { inArray }) => inArray(a.projectId, projectIds),
        columns: { id: true },
      });
      appsInProjects.forEach((a) => accessibleAppIds.add(a.id));
    }

    // Apps via per-app membership (legacy / fine-grained)
    appMemberships.forEach((m) => accessibleAppIds.add(m.appId));

    if (accessibleAppIds.size === 0) return [];

    return db.query.applications.findMany({
      where: inArray(schema.applications.id, [...accessibleAppIds]),
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

    if (!(await canDo(userId, role, application.id, 'view'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }
    return application;
  });

  // ── POST /api/apps ─────────────────────────────────────────────────────────
  fastify.post('/', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const body = createAppSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const { type, image, composeContent, githubUrl } = body.data;
    if (type === 'docker-image' && !image) {
      return reply.code(400).send({ error: 'Validation', message: 'image is required for docker-image type' });
    }
    if (type === 'compose' && !composeContent) {
      return reply.code(400).send({ error: 'Validation', message: 'composeContent is required for compose type' });
    }
    if (type === 'github' && !githubUrl) {
      return reply.code(400).send({ error: 'Validation', message: 'githubUrl est requis pour le type github' });
    }
    if (type === 'github-app' && !body.data.githubInstallationId) {
      return reply.code(400).send({ error: 'Validation', message: 'githubInstallationId requis pour le type github-app' });
    }

    // If no projectId specified → assign to Default project
    const projectId = body.data.projectId ?? '00000000-0000-0000-0000-000000000001';
    let appData = { ...body.data, projectId };

    if (!isGlobalAdmin(role)) {
      // Non-admin: must be owner or member of the target project
      const membership = await db.query.projectMembers.findFirst({
        where: and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
        ),
      });
      if (!membership || membership.role === 'viewer') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Vous devez être membre actif de ce projet pour créer une application' });
      }
      // Project member cannot set domain/URL settings (admin projet or admin général only)
      if (membership.role === 'member') {
        appData = { ...appData, subdomain: undefined, domain: undefined, tlsEnabled: false };
      }
    }

    const wc = await getWildcardSettings();
    const data = {
      ...appData,
      subdomain: appData.subdomain || appData.name,
      domain:    appData.domain    || wc.wildcardDomain || undefined,
      tlsEnabled: appData.tlsEnabled ?? (wc.defaultTls && !!wc.wildcardDomain),
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

    if (!(await canDo(userId, role, existing.id, 'edit'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    const body = updateAppSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    let updates = { ...body.data };

    // Project member cannot change domain/URL settings — strip those fields
    if (!isGlobalAdmin(role) && existing.projectId) {
      const membership = await db.query.projectMembers.findFirst({
        where: and(
          eq(schema.projectMembers.projectId, existing.projectId),
          eq(schema.projectMembers.userId, userId),
        ),
      });
      if (membership?.role === 'member') {
        const { subdomain: _s, domain: _d, tlsEnabled: _t, ingressClass: _i, ...safeUpdates } = updates;
        updates = safeUpdates;
      }
    }

    if (updates.name && updates.name !== existing.name) {
      try { await k8s.deleteApp(existing); } catch (err) {
        fastify.log.warn(`Could not remove old k8s resources for ${existing.name}: ${err}`);
      }
    }

    const [updated] = await db
      .update(schema.applications)
      .set({ ...updates, updatedAt: new Date() })
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

    if (!(await canDo(userId, role, existing.id, 'delete'))) {
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

    if (!(await canDo(userId, role, application.id, 'deploy'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    const deployment = await deployService.deploy(application, userId);
    return reply.code(202).send(deployment);
  });

  // ── POST /api/apps/:id/rollback ────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { imageTag: string } }>(
    '/:id/rollback',
    auth,
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, request.params.id),
      });
      if (!application) return reply.code(404).send({ error: 'Not Found' });

      if (!(await canDo(userId, role, application.id, 'deploy'))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
      }

      const { imageTag } = request.body;
      if (!imageTag) return reply.code(400).send({ error: 'imageTag is required' });

      const deployment = await deployService.rollback(application, imageTag, userId);
      return reply.code(202).send(deployment);
    },
  );

  // ── POST /api/apps/:id/webhook/setup ──────────────────────────────────────
  // Auto-configure a webhook secret for this app (without going through git source)
  fastify.post<{ Params: { id: string } }>('/:id/webhook/setup', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!isGlobalAdmin(role)) return reply.code(403).send({ error: 'Admin only' });

    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    const secret = generateWebhookSecret();
    await db.update(schema.applications).set({
      webhookSecret: secret,
      updatedAt: new Date(),
    }).where(eq(schema.applications.id, request.params.id));

    const provider = application.gitSourceId ? 'auto' : 'github';
    const settingsRows = await db.query.settings.findMany();
    const s: Record<string, string> = {};
    for (const r of settingsRows) s[r.key] = r.value;
    const appUrl = s['interfaceDomain'] ? `https://${s['interfaceDomain']}` : '';
    const webhookUrl = appUrl ? `${appUrl}/api/webhooks/github/${application.id}` : `/api/webhooks/github/${application.id}`;

    return { secret, webhookUrl };
  });

  // ── POST /api/apps/:id/start ───────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/start', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await canDo(userId, role, application.id, 'deploy'))) {
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

    if (!(await canDo(userId, role, application.id, 'deploy'))) {
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

    if (!(await canDo(userId, role, application.id, 'deploy'))) {
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

    if (!(await canDo(userId, role, application.id, 'view'))) {
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

    if (!(await canDo(userId, role, application.id, 'view'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }

    const rows = await db.query.deployments.findMany({
      where: eq(schema.deployments.applicationId, request.params.id),
      orderBy: [desc(schema.deployments.createdAt)],
      limit: 20,
    });

    // Enrich with triggeredBy email
    const trigIds = [...new Set(rows.map((d) => d.triggeredById).filter(Boolean))] as string[];
    const trigUsers = trigIds.length > 0
      ? await db.query.users.findMany({ where: inArray(schema.users.id, trigIds), columns: { id: true, email: true } })
      : [];
    const emailMap = new Map(trigUsers.map((u) => [u.id, u.email]));

    return rows.map((d) => ({
      ...d,
      triggeredByEmail: d.triggeredById ? (emailMap.get(d.triggeredById) ?? null) : null,
    }));
  });

  // ── GET /api/apps/:id/my-role ──────────────────────────────────────────────
  // Returns the current user's effective role on this app (any authenticated user).
  fastify.get<{ Params: { id: string } }>('/:id/my-role', auth, async (request, reply) => {
    const { sub: userId, role: globalRole } = request.user;

    if (isGlobalAdmin(globalRole)) {
      return { role: 'owner' as const, isAdmin: true };
    }

    const membership = await db.query.appPermissions.findFirst({
      where: and(
        eq(schema.appPermissions.appId, request.params.id),
        eq(schema.appPermissions.userId, userId),
      ),
    });
    return { role: (membership?.role ?? null) as 'owner' | 'editor' | 'viewer' | null, isAdmin: false };
  });

  // ── GET /api/apps/:id/members (admin or owner) ─────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/members', auth, async (request, reply) => {
    const { sub: userId, role: globalRole } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await canDo(userId, globalRole, application.id, 'manageTeam'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Owner or admin only' });
    }

    // All non-admin users
    const allUsers = await db.query.users.findMany({
      columns: { id: true, email: true, role: true },
    });
    const nonAdmins = allUsers.filter((u) => !isGlobalAdmin(u.role));

    // Per-app explicit permissions
    const appMemberships = await db.query.appPermissions.findMany({
      where: eq(schema.appPermissions.appId, request.params.id),
    });
    const appMemberMap = new Map(appMemberships.map((m) => [m.userId, m]));

    // Project-level memberships (if app belongs to a project)
    const projMemberMap = new Map<string, string>();
    if (application.projectId) {
      const projMemberships = await db.query.projectMembers.findMany({
        where: eq(schema.projectMembers.projectId, application.projectId),
      });
      for (const pm of projMemberships) projMemberMap.set(pm.userId, pm.role);
    }

    return nonAdmins.map((u) => {
      const appM  = appMemberMap.get(u.id);
      const projR = projMemberMap.get(u.id) ?? null;
      return {
        userId:      u.id,
        email:       u.email,
        globalRole:  u.role,
        appRole:     (appM?.role ?? null) as 'owner' | 'editor' | 'viewer' | null,
        projectRole: projR as 'owner' | 'member' | 'viewer' | null,
        memberId:    appM?.id ?? null,
        createdAt:   appM?.createdAt ?? null,
      };
    });
  });

  // ── POST /api/apps/:id/members (admin or owner) ────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/members', auth, async (request, reply) => {
    const { sub: userId, role: globalRole } = request.user;
    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) return reply.code(404).send({ error: 'Not Found' });

    if (!(await canDo(userId, globalRole, application.id, 'manageTeam'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Owner or admin only' });
    }

    const body = inviteMemberSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(schema.users.id, body.data.userId),
    });
    if (!targetUser) return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    if (isGlobalAdmin(targetUser.role)) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Les admins ont déjà un accès complet' });
    }

    const [membership] = await db
      .insert(schema.appPermissions)
      .values({ appId: request.params.id, userId: body.data.userId, role: body.data.role })
      .onConflictDoUpdate({
        target: [schema.appPermissions.appId, schema.appPermissions.userId],
        set: { role: body.data.role },
      })
      .returning();

    return reply.code(201).send(membership);
  });

  // ── PATCH /api/apps/:id/members/:userId (admin or owner) ───────────────────
  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    auth,
    async (request, reply) => {
      const { sub: userId, role: globalRole } = request.user;
      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, request.params.id),
      });
      if (!application) return reply.code(404).send({ error: 'Not Found' });

      if (!(await canDo(userId, globalRole, application.id, 'manageTeam'))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Owner or admin only' });
      }

      const body = updateMemberRoleSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
      }

      const [updated] = await db
        .update(schema.appPermissions)
        .set({ role: body.data.role })
        .where(
          and(
            eq(schema.appPermissions.appId, request.params.id),
            eq(schema.appPermissions.userId, request.params.userId),
          ),
        )
        .returning();

      if (!updated) return reply.code(404).send({ error: 'Not Found', message: 'Membership not found' });
      return updated;
    },
  );

  // ── DELETE /api/apps/:id/members/:userId (admin or owner) ──────────────────
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    auth,
    async (request, reply) => {
      const { sub: userId, role: globalRole } = request.user;
      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, request.params.id),
      });
      if (!application) return reply.code(404).send({ error: 'Not Found' });

      if (!(await canDo(userId, globalRole, application.id, 'manageTeam'))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Owner or admin only' });
      }

      await db.delete(schema.appPermissions).where(
        and(
          eq(schema.appPermissions.appId, request.params.id),
          eq(schema.appPermissions.userId, request.params.userId),
        ),
      );
      return reply.code(204).send();
    },
  );
}
