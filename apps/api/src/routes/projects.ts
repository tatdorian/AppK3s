import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, and, desc, count } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { sendMail, emailTemplates } from '../services/email.service.js';
import {
  createProjectSchema,
  updateProjectSchema,
  inviteProjectMemberSchema,
  updateProjectMemberRoleSchema,
} from '@appk3s/shared';

// ─── Permission helpers ───────────────────────────────────────────────────────

type ProjectAction = 'view' | 'deploy' | 'edit' | 'delete' | 'manageTeam';

async function canDoProject(
  userId: string,
  globalRole: string,
  projectId: string,
  action: ProjectAction,
): Promise<boolean> {
  if (globalRole === 'super-admin' || globalRole === 'admin') return true;

  const membership = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId),
    ),
  });
  if (!membership) return false;

  const role = membership.role as 'owner' | 'member' | 'viewer';
  switch (action) {
    case 'view':        return true;
    case 'deploy':      return role === 'owner' || role === 'member';
    case 'edit':        return role === 'owner' || role === 'member';
    case 'delete':      return role === 'owner';
    case 'manageTeam':  return role === 'owner';
    default:            return false;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function projectsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/projects ──────────────────────────────────────────────────────
  // Admin → tous les projets. Others → projets où invités.
  fastify.get('/', auth, async (request) => {
    const { sub: userId, role: globalRole } = request.user;

    // Count apps per project
    const appCounts = await db
      .select({ projectId: schema.applications.projectId, cnt: count() })
      .from(schema.applications)
      .groupBy(schema.applications.projectId);
    const countMap = new Map(appCounts.map((r) => [r.projectId, Number(r.cnt)]));

    if (globalRole === 'super-admin' || globalRole === 'admin') {
      const all = await db.query.projects.findMany({ orderBy: [desc(schema.projects.createdAt)] });
      return all.map((p) => ({ ...p, appCount: countMap.get(p.id) ?? 0, myRole: 'owner' }));
    }

    // Non-admin: only joined projects
    const memberships = await db.query.projectMembers.findMany({
      where: eq(schema.projectMembers.userId, userId),
    });
    if (memberships.length === 0) return [];

    const projectIds = memberships.map((m) => m.projectId);
    const memberMap = new Map(memberships.map((m) => [m.projectId, m.role]));

    const projectList = await db.query.projects.findMany({
      where: (p, { inArray }) => inArray(p.id, projectIds),
      orderBy: [desc(schema.projects.createdAt)],
    });

    return projectList.map((p) => ({
      ...p,
      appCount: countMap.get(p.id) ?? 0,
      myRole: memberMap.get(p.id) ?? null,
    }));
  });

  // ── POST /api/projects (admin only) ────────────────────────────────────────
  fastify.post('/', auth, async (request, reply) => {
    if (request.user.role !== 'super-admin' && request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
    }

    const body = createProjectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const [project] = await db
      .insert(schema.projects)
      .values({
        name: body.data.name,
        description: body.data.description,
        wildcardDomain: body.data.wildcardDomain ?? null,
      })
      .returning();

    // Auto-add all super-admins as project owners
    const superAdmins = await db.query.users.findMany({
      where: eq(schema.users.role, 'super-admin'),
      columns: { id: true },
    });
    if (superAdmins.length > 0) {
      await db.insert(schema.projectMembers)
        .values(superAdmins.map((u) => ({ projectId: project.id, userId: u.id, role: 'owner' as const })))
        .onConflictDoNothing();
    }

    return reply.code(201).send(project);
  });

  // ── GET /api/projects/:id ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role: globalRole } = request.user;
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, request.params.id),
    });
    if (!project) return reply.code(404).send({ error: 'Not Found' });

    if (!(await canDoProject(userId, globalRole, project.id, 'view'))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    // Apps in this project
    const apps = await db.query.applications.findMany({
      where: eq(schema.applications.projectId, project.id),
      orderBy: [desc(schema.applications.createdAt)],
    });

    return { ...project, apps, appCount: apps.length };
  });

  // ── PATCH /api/projects/:id (admin or owner) ───────────────────────────────
  fastify.patch<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId, role: globalRole } = request.user;
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, request.params.id),
    });
    if (!project) return reply.code(404).send({ error: 'Not Found' });

    if (!(await canDoProject(userId, globalRole, project.id, 'manageTeam'))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = updateProjectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const [updated] = await db
      .update(schema.projects)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(schema.projects.id, project.id))
      .returning();

    return updated;
  });

  // ── DELETE /api/projects/:id (admin only) ──────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    if (request.user.role !== 'super-admin' && request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin only' });
    }

    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, request.params.id),
    });
    if (!project) return reply.code(404).send({ error: 'Not Found' });

    // Do NOT delete apps — just detach them (project_id → null / default)
    await db
      .update(schema.applications)
      .set({ projectId: '00000000-0000-0000-0000-000000000001' })
      .where(eq(schema.applications.projectId, project.id));

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));
    return reply.code(204).send();
  });

  // ── GET /api/projects/:id/members (owner or admin) ────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/members', auth, async (request, reply) => {
    const { sub: userId, role: globalRole } = request.user;
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, request.params.id),
    });
    if (!project) return reply.code(404).send({ error: 'Not Found' });

    if (!(await canDoProject(userId, globalRole, project.id, 'manageTeam'))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const memberships = await db.query.projectMembers.findMany({
      where: eq(schema.projectMembers.projectId, project.id),
    });
    const memberUserIds = memberships.map((m) => m.userId);

    // All non-admin users
    const allUsers = await db.query.users.findMany({
      columns: { id: true, email: true, role: true },
    });
    const nonAdmins = allUsers.filter((u) => u.role !== 'super-admin' && u.role !== 'admin');
    const memberMap = new Map(memberships.map((m) => [m.userId, m]));

    return nonAdmins.map((u) => {
      const m = memberMap.get(u.id);
      return {
        userId:     u.id,
        email:      u.email,
        globalRole: u.role,
        projectRole: m?.role ?? null,
        memberId:   m?.id ?? null,
        createdAt:  m?.createdAt ?? null,
        isMember:   memberUserIds.includes(u.id),
      };
    });
  });

  // ── POST /api/projects/:id/members (owner or admin) ───────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/members', auth, async (request, reply) => {
    const { sub: userId, role: globalRole } = request.user;
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, request.params.id),
    });
    if (!project) return reply.code(404).send({ error: 'Not Found' });

    if (!(await canDoProject(userId, globalRole, project.id, 'manageTeam'))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = inviteProjectMemberSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(schema.users.id, body.data.userId),
    });
    if (!targetUser) return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    if (targetUser.role === 'super-admin' || targetUser.role === 'admin') {
      return reply.code(400).send({ error: 'Bad Request', message: 'Admins already have full access' });
    }

    const [membership] = await db
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId: body.data.userId, role: body.data.role })
      .onConflictDoUpdate({
        target: [schema.projectMembers.projectId, schema.projectMembers.userId],
        set: { role: body.data.role },
      })
      .returning();

    return reply.code(201).send(membership);
  });

  // ── PATCH /api/projects/:id/members/:userId (owner or admin) ──────────────
  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    auth,
    async (request, reply) => {
      const { sub: userId, role: globalRole } = request.user;
      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, request.params.id),
      });
      if (!project) return reply.code(404).send({ error: 'Not Found' });

      if (!(await canDoProject(userId, globalRole, project.id, 'manageTeam'))) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const body = updateProjectMemberRoleSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Validation', message: body.error.flatten() });
      }

      const [updated] = await db
        .update(schema.projectMembers)
        .set({ role: body.data.role })
        .where(
          and(
            eq(schema.projectMembers.projectId, project.id),
            eq(schema.projectMembers.userId, request.params.userId),
          ),
        )
        .returning();

      if (!updated) return reply.code(404).send({ error: 'Not Found' });
      return updated;
    },
  );

  // ── DELETE /api/projects/:id/members/:userId (owner or admin) ─────────────
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    auth,
    async (request, reply) => {
      const { sub: userId, role: globalRole } = request.user;
      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, request.params.id),
      });
      if (!project) return reply.code(404).send({ error: 'Not Found' });

      if (!(await canDoProject(userId, globalRole, project.id, 'manageTeam'))) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await db.delete(schema.projectMembers).where(
        and(
          eq(schema.projectMembers.projectId, project.id),
          eq(schema.projectMembers.userId, request.params.userId),
        ),
      );
      return reply.code(204).send();
    },
  );

  // ── POST /api/projects/:id/users ──────────────────────────────────────────
  // Crée un nouveau compte utilisateur ET l'ajoute immédiatement au projet.
  // Accessible aux : admin général + project owner.
  // Règles :
  //   - Project owner peut créer des utilisateurs avec projectRole = member | viewer
  //   - Seul admin général peut attribuer projectRole = owner (admin projet)
  //   - Le compte créé obtient toujours le rôle global "viewer"
  fastify.post<{ Params: { id: string } }>('/:id/users', auth, async (request, reply) => {
    const { sub: callerId, role: globalRole } = request.user;

    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, request.params.id),
    });
    if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Projet introuvable' });

    if (!(await canDoProject(callerId, globalRole, project.id, 'manageTeam'))) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Droits insuffisants' });
    }

    const { email, projectRole } = (request.body ?? {}) as {
      email?: string;
      projectRole?: string;
    };

    if (!email || !projectRole) {
      return reply.code(400).send({
        error: 'Validation',
        message: 'email et projectRole sont requis',
      });
    }

    const validProjectRoles = ['owner', 'member', 'viewer'];
    if (!validProjectRoles.includes(projectRole)) {
      return reply.code(400).send({ error: 'Validation', message: 'projectRole invalide' });
    }

    // Un project owner ne peut PAS nommer un autre Admin Projet (owner)
    // Seul un admin général peut le faire
    if (globalRole !== 'admin' && projectRole === 'owner') {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Seul un Admin Général peut nommer un Admin Projet',
      });
    }

    // Vérifier que l'email n'est pas déjà pris
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Email déjà utilisé' });
    }

    // Generate one-time setup token (7-day expiry)
    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

    // Créer le compte avec rôle global "viewer" + setup token
    const [newUser] = await db
      .insert(schema.users)
      .values({ email, passwordHash, role: 'viewer', setupToken, setupTokenExpiresAt })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      });

    // Ajouter au projet avec le rôle projet demandé
    const [membership] = await db
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId: newUser.id, role: projectRole })
      .returning();

    // Build setup URL and send welcome email (non-blocking)
    let baseUrl = `${request.protocol}://${request.hostname}`;
    try {
      const domainRow = await db.query.settings.findFirst({
        where: eq(schema.settings.key, 'interfaceDomain'),
      });
      if (domainRow?.value) baseUrl = `https://${domainRow.value}`;
    } catch { /* use request host */ }

    const setupUrl = `${baseUrl}/setup-password?token=${setupToken}`;
    try {
      const tpl = emailTemplates.welcomeUser(email, setupUrl);
      await sendMail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to send welcome email');
    }

    return reply.code(201).send({ user: { ...newUser, emailSent: true }, membership });
  });

  // ── GET /api/projects/:id/my-role ─────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/my-role', auth, async (request) => {
    const { sub: userId, role: globalRole } = request.user;
    if (globalRole === 'super-admin' || globalRole === 'admin') return { role: 'owner' as const, isAdmin: true };

    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(schema.projectMembers.projectId, request.params.id),
        eq(schema.projectMembers.userId, userId),
      ),
    });
    return { role: (membership?.role ?? null) as 'owner' | 'member' | 'viewer' | null, isAdmin: false };
  });
}
