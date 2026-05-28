import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { sendMail, emailTemplates } from '../services/email.service.js';

// Roles with global (non-project-scoped) access
const GLOBAL_ADMIN_ROLES = ['super-admin', 'admin'] as const;
type GlobalRole = typeof GLOBAL_ADMIN_ROLES[number];

function isSuperAdmin(role: string) { return role === 'super-admin'; }
function isGlobalAdmin(role: string) { return GLOBAL_ADMIN_ROLES.includes(role as GlobalRole); }

export async function usersRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  const auth = { preHandler: fastify.authenticate };

  // GET /api/users — super-admin only
  fastify.get('/', auth, async (request, reply) => {
    if (!isSuperAdmin(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Super-admin requis' });
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

  // POST /api/users — super-admin creates a new user (welcome email sent)
  // Body: { email, role?, projects? }
  //   role: 'super-admin' | 'admin' | 'member' | 'viewer'
  //   projects: 'all' | [{ projectId, projectRole }]  — only for non-super-admin roles
  fastify.post<{
    Body: {
      email: string;
      role?: string;
      projects?: 'all' | Array<{ projectId: string; projectRole: string }>;
    };
  }>('/', auth, async (request, reply) => {
    if (!isSuperAdmin(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Super-admin requis' });
    }
    const { email, role = 'member', projects } = request.body as {
      email: string;
      role?: string;
      projects?: 'all' | Array<{ projectId: string; projectRole: string }>;
    };
    if (!email) {
      return reply.code(400).send({ error: 'Validation', message: 'email requis' });
    }

    const validRoles = ['super-admin', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return reply.code(400).send({ error: 'Validation', message: `Rôle invalide : ${role}` });
    }

    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (existing) {
      return reply.code(409).send({ error: 'Conflict', message: 'Email déjà utilisé' });
    }

    // Generate one-time setup token (7-day expiry)
    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Placeholder password hash — user cannot log in until they set a real password
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash, role, setupToken, setupTokenExpiresAt })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      });

    // ── Project memberships ─────────────────────────────────────────────────
    // super-admin → auto-add to ALL projects as owner (implicit access anyway)
    // admin       → add to specified projects as owner (project role derived from global)
    // member      → add to specified projects as member
    let projectsAssigned = 0;
    const derivedProjectRole = role === 'admin' ? 'owner' : 'member';

    if (isSuperAdmin(role)) {
      // Add super-admin to every existing project as owner
      const allProjects = await db.query.projects.findMany();
      if (allProjects.length > 0) {
        await db.insert(schema.projectMembers).values(
          allProjects.map((p) => ({ projectId: p.id, userId: user.id, role: 'owner' as const })),
        ).onConflictDoNothing();
        projectsAssigned = allProjects.length;
      }
    } else if (projects) {
      if (projects === 'all') {
        const allProjects = await db.query.projects.findMany();
        if (allProjects.length > 0) {
          await db.insert(schema.projectMembers).values(
            allProjects.map((p) => ({ projectId: p.id, userId: user.id, role: derivedProjectRole as any })),
          );
          projectsAssigned = allProjects.length;
        }
      } else if (Array.isArray(projects) && projects.length > 0) {
        await db.insert(schema.projectMembers).values(
          projects.map((p) => ({
            projectId: p.projectId,
            userId: user.id,
            // Always derive role from global role — ignore per-project role sent by client
            role: derivedProjectRole as any,
          })),
        );
        projectsAssigned = projects.length;
      }
    }

    // Build setup URL using interfaceDomain from settings (fallback to request host)
    let baseUrl = `${request.protocol}://${request.hostname}`;
    try {
      const domainRow = await db.query.settings.findFirst({
        where: eq(schema.settings.key, 'interfaceDomain'),
      });
      if (domainRow?.value) {
        baseUrl = `https://${domainRow.value}`;
      }
    } catch { /* use request host as fallback */ }

    const setupUrl = `${baseUrl}/setup-password?token=${setupToken}`;

    // Send welcome email (non-blocking)
    try {
      const tpl = emailTemplates.welcomeUser(email, setupUrl);
      await sendMail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to send welcome email');
    }

    return reply.code(201).send({ ...user, emailSent: true, projectsAssigned });
  });

  // PATCH /api/users/:id — super-admin changes role, or self changes password/email
  fastify.patch<{
    Params: { id: string };
    Body: { email?: string; role?: string; password?: string; currentPassword?: string };
  }>('/:id', auth, async (request, reply) => {
    const { id } = request.params;
    const { email, role, password, currentPassword } = request.body as {
      email?: string;
      role?: string;
      password?: string;
      currentPassword?: string;
    };
    const callerRole = request.user.role;
    const isSAdmin = isSuperAdmin(callerRole);
    const isSelf = request.user.sub === id;

    if (!isSAdmin && !isSelf) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const target = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
    if (!target) return reply.code(404).send({ error: 'Not Found' });

    // Email change: self or super-admin
    if (email !== undefined) {
      if (!isSAdmin && !isSelf) {
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

    // Role change: super-admin only
    if (role !== undefined) {
      if (!isSAdmin) return reply.code(403).send({ error: 'Forbidden', message: 'Super-admin requis' });
      const validRoles = ['super-admin', 'admin', 'member', 'viewer'];
      if (!validRoles.includes(role)) {
        return reply.code(400).send({ error: 'Validation', message: `Rôle invalide : ${role}` });
      }
      await db.update(schema.users).set({ role }).where(eq(schema.users.id, id));

      // When promoting to super-admin: add as owner to ALL projects they're not yet in.
      if (role === 'super-admin') {
        const allProjects = await db.query.projects.findMany();
        for (const project of allProjects) {
          await db.insert(schema.projectMembers)
            .values({ projectId: project.id, userId: id, role: 'owner' })
            .onConflictDoUpdate({
              target: [schema.projectMembers.projectId, schema.projectMembers.userId],
              set: { role: 'owner' },
            });
        }
      }

      // When changing to admin: upgrade all existing project memberships to owner.
      if (role === 'admin') {
        await db.update(schema.projectMembers)
          .set({ role: 'owner' })
          .where(eq(schema.projectMembers.userId, id));
      }
    }

    // Password change
    if (password) {
      if (password.length < 8) {
        return reply.code(400).send({ error: 'Validation', message: 'Le mot de passe doit comporter au moins 8 caractères' });
      }
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
        return reply.code(400).send({ error: 'Validation', message: 'Le mot de passe doit contenir au moins une majuscule et une minuscule' });
      }
      if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
        return reply.code(400).send({ error: 'Validation', message: 'Le mot de passe doit contenir au moins un chiffre ou un caractère spécial' });
      }
      // Non-super-admin users must verify their current password unless mustChangePassword is set
      if (!isSAdmin && isSelf && !target.mustChangePassword) {
        if (!currentPassword) {
          return reply.code(400).send({ error: 'Validation', message: 'currentPassword requis' });
        }
        const ok = await bcrypt.compare(currentPassword, target.passwordHash);
        if (!ok) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Mot de passe actuel incorrect' });
        }
      }
      const passwordHash = await bcrypt.hash(password, 12);
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

  // DELETE /api/users/:id — super-admin only, cannot delete yourself
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    if (!isSuperAdmin(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Super-admin requis' });
    }
    if (request.user.sub === request.params.id) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Vous ne pouvez pas supprimer votre propre compte' });
    }
    const deleted = await db
      .delete(schema.users)
      .where(eq(schema.users.id, request.params.id))
      .returning({ id: schema.users.id });
    if (!deleted.length) return reply.code(404).send({ error: 'Not Found' });
    return reply.code(204).send();
  });
}
