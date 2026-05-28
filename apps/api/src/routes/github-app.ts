/**
 * GitHub App routes
 *
 * Manifest flow (création de la GitHub App via GitHub) :
 *   1. GET  /api/github-app/manifest-data   → retourne le manifest JSON (auth)
 *   2. (frontend soumet un form HTML vers https://github.com/settings/apps/new)
 *   3. GET  /api/github-app/callback?code=  → échange le code → stocke les credentials
 *
 * Installation flow :
 *   4. GET  /api/github-app/install-url     → retourne l'URL d'installation (auth)
 *   5. POST /api/github-app/installations   → enregistre l'installation (auth)
 *
 * Usage :
 *   6. GET  /api/github-app/installations/:id/repos/branches/detect
 *   7. DELETE /api/github-app/installations/:id
 *   8. POST /api/github-app/webhook  → événements push
 */

import type { FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import { sql, eq, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import {
  getGithubApp,
  makeGithubAppApi,
  GitHubInstallationApi,
  getInstallationToken,
  encryptValue,
  decryptValue,
  getAppUrl,
} from '../services/github-app.service.js';
import { DeploymentService } from '../services/deployment.service.js';
import { KubernetesService } from '../services/kubernetes.service.js';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';

const k8s = new KubernetesService();
const deployService = new DeploymentService(k8s);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getInstallationRow(id: string) {
  const rows = await db.execute(
    sql`SELECT * FROM github_installations WHERE id = ${id} LIMIT 1`,
  );
  return (rows as any).rows?.[0] ?? null;
}

async function getInstallationByInstallId(installationId: number) {
  const rows = await db.execute(
    sql`SELECT * FROM github_installations WHERE installation_id = ${installationId} LIMIT 1`,
  );
  return (rows as any).rows?.[0] ?? null;
}

// ── Route registration ────────────────────────────────────────────────────────

export async function githubAppRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── Helper: signed state for manifest flow (embeds userId) ───────────────────
  function makeManifestState(userId: string): string {
    const nonce = crypto.randomBytes(8).toString('hex');
    const payload = `${userId}.${nonce}`;
    const hmac = crypto.createHmac('sha256', config.jwtSecret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
  }

  function verifyManifestState(state: string): string | null {
    const parts = state.split('.');
    if (parts.length < 3) return null;
    const hmac = parts.pop()!;
    const payload = parts.join('.');
    const expected = crypto.createHmac('sha256', config.jwtSecret).update(payload).digest('hex');
    try {
      if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return null;
    } catch { return null; }
    return parts[0]; // userId
  }

  // ── 1. Manifest data — tout utilisateur authentifié peut créer sa GitHub App ──
  fastify.get('/manifest-data', auth, async (request, reply) => {
    const { sub: userId } = request.user;
    const existing = await getGithubApp(userId);
    if (existing) {
      return reply.code(409).send({ error: 'Tu as déjà une GitHub App. Supprime-la d\'abord.' });
    }

    const appUrl = await getAppUrl();
    const appName = `AppK3s-${crypto.randomBytes(3).toString('hex')}`;
    const state = makeManifestState(userId);

    const manifest = {
      name: appName,
      url: appUrl,
      hook_attributes: {
        url: `${appUrl}/api/github-app/webhook`,
        active: true,
      },
      redirect_url: `${appUrl}/api/github-app/callback`,
      callback_urls: [`${appUrl}/api/github-app/install/callback`],
      setup_url: `${appUrl}/github-app/installed`,
      setup_on_update: true,
      public: false,
      default_permissions: {
        metadata: 'read',
        contents: 'read',
        pull_requests: 'read',
      },
      default_events: ['push', 'pull_request'],
      description: 'AppK3s – déploiement automatique depuis GitHub',
    };

    return {
      manifest: JSON.stringify(manifest),
      githubUrl: 'https://github.com/settings/apps/new',
      state,
    };
  });

  // ── 2. Callback après création de l'app — extrait le userId du state ─────────
  fastify.get<{ Querystring: { code?: string; state?: string } }>('/callback', async (request, reply) => {
    const { code, state } = request.query;
    if (!code) return reply.redirect('/settings?tab=github-app&error=no_code');

    // Verify state and extract userId
    const userId = state ? verifyManifestState(state) : null;
    if (!userId) {
      fastify.log.error('GitHub App callback: invalid or missing state');
      return reply.redirect('/github-app?error=invalid_state');
    }

    const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: 'POST',
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'AppK3s/1.0' },
    });
    if (!res.ok) {
      const err = await res.text();
      fastify.log.error(`GitHub App manifest conversion failed: ${err}`);
      return reply.redirect(`/github-app?error=${encodeURIComponent('Échange de code échoué')}`);
    }
    const data = await res.json() as any;

    // Remove existing app for this user and create new one
    await db.execute(sql`DELETE FROM github_app WHERE user_id = ${userId}`);
    await db.execute(sql`
      INSERT INTO github_app (app_id, slug, name, client_id, client_secret, webhook_secret, private_key, html_url, user_id)
      VALUES (
        ${data.id},
        ${data.slug},
        ${data.name},
        ${data.client_id},
        ${encryptValue(data.client_secret)},
        ${encryptValue(data.webhook_secret)},
        ${encryptValue(data.pem)},
        ${data.html_url ?? ''},
        ${userId}
      )
    `);

    fastify.log.info(`GitHub App "${data.name}" (id=${data.id}) créée pour user ${userId}`);
    return reply.redirect('/github-app?created=1');
  });

  // ── 3. Get current user's app info ──────────────────────────────────────────
  fastify.get('/', auth, async (request, reply) => {
    const { sub: userId } = request.user;
    const app = await getGithubApp(userId);
    if (!app) return reply.code(404).send({ error: 'GitHub App non configurée' });
    return {
      id: app.id,
      appId: app.appId,
      slug: app.slug,
      name: app.name,
      htmlUrl: app.htmlUrl,
      installUrl: `https://github.com/apps/${app.slug}/installations/new`,
      createdAt: app.createdAt,
    };
  });

  // ── 4. Delete current user's app ────────────────────────────────────────────
  fastify.delete('/', auth, async (request, reply) => {
    const { sub: userId } = request.user;
    await db.execute(sql`DELETE FROM github_app WHERE user_id = ${userId}`);
    return reply.code(204).send();
  });

  // ── 5. Install URL ──────────────────────────────────────────────────────────
  fastify.get('/install-url', auth, async (request, reply) => {
    const { sub: userId } = request.user;
    const app = await getGithubApp(userId);
    if (!app) return reply.code(404).send({ error: 'GitHub App non configurée' });
    return { url: `https://github.com/apps/${app.slug}/installations/new` };
  });

  // ── 6. Register installation ────────────────────────────────────────────────
  fastify.post<{ Body: { installationId: number } }>(
    '/installations',
    auth,
    async (request, reply) => {
      const { sub: userId } = request.user;
      const { installationId } = request.body;
      if (!installationId) return reply.code(400).send({ error: 'installationId requis' });

      const api = await makeGithubAppApi(userId);
      let installation: any;
      try {
        installation = await api.getInstallation(installationId);
      } catch (err: any) {
        return reply.code(400).send({ error: `Installation introuvable: ${err.message}` });
      }

      const account = installation.account ?? {};
      const existing = await getInstallationByInstallId(installationId);

      if (existing) {
        await db.execute(sql`
          UPDATE github_installations SET
            user_id = ${userId},
            account_login = ${account.login ?? ''},
            account_type = ${account.type ?? 'User'},
            account_avatar_url = ${account.avatar_url ?? null},
            repository_selection = ${installation.repository_selection ?? 'selected'},
            suspended = ${installation.suspended_at ? true : false},
            updated_at = NOW()
          WHERE installation_id = ${installationId}
        `);
        return { id: existing.id, installationId, login: account.login };
      }

      const rows = await db.execute(sql`
        INSERT INTO github_installations
          (installation_id, user_id, account_login, account_type, account_avatar_url, repository_selection, suspended)
        VALUES (
          ${installationId},
          ${userId},
          ${account.login ?? ''},
          ${account.type ?? 'User'},
          ${account.avatar_url ?? null},
          ${installation.repository_selection ?? 'selected'},
          ${installation.suspended_at ? true : false}
        )
        RETURNING id
      `);

      const id = (rows as any).rows?.[0]?.id;
      return reply.code(201).send({ id, installationId, login: account.login });
    },
  );

  // ── 7. List installations — chaque user voit uniquement les siennes ────────
  fastify.get('/installations', auth, async (request) => {
    const { sub: userId } = request.user;
    const rows = await db.execute(sql`
      SELECT id, installation_id, user_id, account_login, account_type,
             account_avatar_url, repository_selection, suspended, created_at
      FROM github_installations WHERE user_id = ${userId} ORDER BY created_at DESC
    `);
    return ((rows as any).rows ?? []).map((r: any) => ({
      id: r.id,
      installationId: Number(r.installation_id),
      userId: r.user_id,
      accountLogin: r.account_login,
      accountType: r.account_type,
      accountAvatarUrl: r.account_avatar_url,
      repositorySelection: r.repository_selection,
      suspended: r.suspended,
      createdAt: r.created_at,
    }));
  });

  // ── 8. Delete installation ──────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/installations/:id',
    auth,
    async (request, reply) => {
      const row = await getInstallationRow(request.params.id);
      if (!row) return reply.code(404).send({ error: 'Installation introuvable' });
      await db.execute(sql`DELETE FROM github_installations WHERE id = ${request.params.id}`);
      return reply.code(204).send();
    },
  );

  // ── 9. List repos for an installation ──────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/installations/:id/repos',
    auth,
    async (request, reply) => {
      const row = await getInstallationRow(request.params.id);
      if (!row) return reply.code(404).send({ error: 'Installation introuvable' });
      const token = await getInstallationToken(Number(row.installation_id));
      return new GitHubInstallationApi(token).listRepos();
    },
  );

  // ── 10. List branches ───────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { repo: string } }>(
    '/installations/:id/branches',
    auth,
    async (request, reply) => {
      const { repo } = request.query;
      if (!repo) return reply.code(400).send({ error: 'repo requis' });
      const row = await getInstallationRow(request.params.id);
      if (!row) return reply.code(404).send({ error: 'Installation introuvable' });
      const token = await getInstallationToken(Number(row.installation_id));
      const [owner, repoName] = repo.split('/');
      return new GitHubInstallationApi(token).listBranches(owner, repoName);
    },
  );

  // ── 11. Detect build type ───────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { repo: string; branch?: string } }>(
    '/installations/:id/detect',
    auth,
    async (request, reply) => {
      const { repo, branch = 'main' } = request.query;
      if (!repo) return reply.code(400).send({ error: 'repo requis' });
      const row = await getInstallationRow(request.params.id);
      if (!row) return reply.code(404).send({ error: 'Installation introuvable' });
      const token = await getInstallationToken(Number(row.installation_id));
      const [owner, repoName] = repo.split('/');
      return new GitHubInstallationApi(token).detectBuild(owner, repoName, branch);
    },
  );

  // ── 12. Webhook (push events from GitHub App) ───────────────────────────────
  fastify.post('/webhook', async (request, reply) => {
    const githubApp = await getGithubApp();
    if (!githubApp) return reply.code(200).send({ ok: false, reason: 'no app' });

    const sig = (request.headers['x-hub-signature-256'] as string) ?? '';
    const secret = decryptValue(githubApp.webhookSecret);
    const payloadStr = JSON.stringify(request.body);
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(payloadStr, 'utf8').digest('hex')}`;

    if (sig && secret) {
      try {
        if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
          return reply.code(403).send({ error: 'Invalid signature' });
        }
      } catch {
        return reply.code(403).send({ error: 'Invalid signature' });
      }
    }

    const event = request.headers['x-github-event'] as string;
    if (event !== 'push') return reply.code(200).send({ ok: true, skipped: `event=${event}` });

    const body = request.body as any;
    const repoFullName: string = body?.repository?.full_name ?? '';
    const pushedBranch = (body?.ref ?? '').replace('refs/heads/', '');
    if (!repoFullName) return reply.code(200).send({ ok: false, reason: 'no repo' });

    const apps = await db.execute(sql`
      SELECT * FROM applications
      WHERE type = 'github-app'
        AND github_repo_full_name = ${repoFullName}
        AND auto_deploy = TRUE
        AND (git_branch IS NULL OR git_branch = ${pushedBranch})
    `);

    const appRows = (apps as any).rows ?? [];
    if (appRows.length === 0) return reply.code(200).send({ ok: true, skipped: 'no matching apps' });

    const triggered: string[] = [];
    for (const app of appRows) {
      try {
        const deployment = await deployService.deploy(app);
        triggered.push(deployment.id);
        fastify.log.info(`GitHub App webhook → deploy ${app.name} (${repoFullName}@${pushedBranch})`);
      } catch (err: any) {
        fastify.log.error(`Deploy error for app ${app.id}: ${err.message}`);
      }
    }

    return reply.code(202).send({ ok: true, triggered });
  });

  // ── 13. Install callback (server-side redirect) ─────────────────────────────
  // Also handles GitHub App OAuth user authorization (login with GitHub)
  fastify.get<{ Querystring: { installation_id?: string; setup_action?: string; code?: string; state?: string } }>(
    '/install/callback',
    async (request, reply) => {
      const { installation_id, setup_action, code, state } = request.query;

      // OAuth user authorization flow — initiated by GET /api/auth/github
      if (code && state && !installation_id) {
        return handleGithubOAuthLogin(fastify, code, state, reply);
      }

      // Standard app installation redirect
      if (!installation_id) return reply.redirect('/github-app/installed?error=no_installation_id');
      return reply.redirect(
        `/github-app/installed?installation_id=${installation_id}&setup_action=${setup_action ?? 'install'}`,
      );
    },
  );
}

// ── GitHub App OAuth login handler ────────────────────────────────────────────

async function handleGithubOAuthLogin(
  fastify: FastifyInstance,
  code: string,
  state: string,
  reply: any,
) {
  // Validate HMAC-signed state (generated in GET /api/auth/github)
  const dotIdx = state.indexOf('.');
  if (dotIdx < 0) return reply.redirect('/login?error=invalid_state');
  const nonce = state.slice(0, dotIdx);
  const receivedHmac = state.slice(dotIdx + 1);
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(nonce).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(receivedHmac, 'hex'), Buffer.from(expected, 'hex'))) {
      return reply.redirect('/login?error=invalid_state');
    }
  } catch {
    return reply.redirect('/login?error=invalid_state');
  }

  // Get GitHub App credentials
  const githubApp = await getGithubApp();
  if (!githubApp) return reply.redirect('/login?error=github_app_not_configured');

  // Exchange code for access token
  let accessToken: string;
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'AppK3s/1.0',
      },
      body: JSON.stringify({
        client_id: githubApp.clientId,
        client_secret: decryptValue(githubApp.clientSecret),
        code,
      }),
    });
    const data = await res.json() as any;
    if (!data.access_token) {
      fastify.log.error(`GitHub OAuth token exchange failed: ${JSON.stringify(data)}`);
      return reply.redirect('/login?error=token_exchange_failed');
    }
    accessToken = data.access_token;
  } catch (err: any) {
    fastify.log.error(`GitHub OAuth token exchange error: ${err.message}`);
    return reply.redirect('/login?error=token_exchange_failed');
  }

  // Get GitHub user info and primary verified email
  const ghHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AppK3s/1.0',
  };

  let githubId: string;
  let primaryEmail: string;
  try {
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: ghHeaders }),
      fetch('https://api.github.com/user/emails', { headers: ghHeaders }),
    ]);
    const githubUser = await userRes.json() as any;
    const emails = await emailsRes.json() as any[];

    githubId = String(githubUser.id);
    const primary = emails.find((e: any) => e.primary && e.verified);
    primaryEmail = primary?.email ?? emails[0]?.email;

    if (!primaryEmail) return reply.redirect('/login?error=no_github_email');
  } catch (err: any) {
    fastify.log.error(`GitHub user info error: ${err.message}`);
    return reply.redirect('/login?error=github_api_error');
  }

  // Find existing user by GitHub ID or email, or create a new one
  let user = await db.query.users.findFirst({
    where: or(
      eq(schema.users.githubId, githubId),
      eq(schema.users.email, primaryEmail),
    ),
  });

  if (!user) {
    // New user — default role 'viewer', random unusable password
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    [user] = await db
      .insert(schema.users)
      .values({ email: primaryEmail, passwordHash, role: 'viewer', githubId })
      .returning();
  } else if (!user.githubId) {
    // Link GitHub ID to existing user
    await db.update(schema.users)
      .set({ githubId })
      .where(eq(schema.users.id, user.id));
  }

  const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });
  return reply.redirect(`/oauth/callback?token=${encodeURIComponent(token)}`);
}
