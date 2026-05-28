import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  GitHubApi,
  GitLabApi,
  createGitSource,
  makeGitApi,
  decryptToken,
} from '../services/git-source.service.js';
import { generateWebhookSecret } from '../services/builder.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOAuthSettings(): Promise<{
  github: { clientId: string; clientSecret: string };
  gitlab: { clientId: string; clientSecret: string; baseUrl: string };
  appUrl: string;
}> {
  const rows = await db.query.settings.findMany();
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return {
    github: {
      clientId: s['githubClientId'] ?? process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: s['githubClientSecret'] ?? process.env.GITHUB_CLIENT_SECRET ?? '',
    },
    gitlab: {
      clientId: s['gitlabClientId'] ?? process.env.GITLAB_CLIENT_ID ?? '',
      clientSecret: s['gitlabClientSecret'] ?? process.env.GITLAB_CLIENT_SECRET ?? '',
      baseUrl: s['gitlabBaseUrl'] ?? 'https://gitlab.com',
    },
    appUrl: s['interfaceDomain']
      ? `https://${s['interfaceDomain']}`
      : `http://localhost:${process.env.PORT ?? 3001}`,
  };
}

export async function gitRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ─── List git sources for current user ────────────────────────────────────
  fastify.get('/', auth, async (request) => {
    const { sub: userId } = request.user;
    const sources = await db.query.gitSources.findMany({
      where: eq(schema.gitSources.userId, userId),
    });
    // Don't expose tokens
    return sources.map(({ accessToken: _, refreshToken: __, ...s }) => s);
  });

  // ─── Delete a git source ──────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const { sub: userId } = request.user;
    await db.delete(schema.gitSources).where(
      and(eq(schema.gitSources.id, request.params.id), eq(schema.gitSources.userId, userId)),
    );
    return reply.code(204).send();
  });

  // ─── GitHub OAuth — retourne l'URL (fetch authentifié, pas de redirect direct) ──
  fastify.get('/github/oauth-url', auth, async (request, reply) => {
    const settings = await getOAuthSettings();
    if (!settings.github.clientId) {
      return reply.code(400).send({ error: 'GitHub OAuth non configuré. Ajoutez githubClientId et githubClientSecret dans les Paramètres.' });
    }
    const { sub: userId } = request.user;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const redirectUri = `${settings.appUrl}/api/git/github/callback`;

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', settings.github.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'repo read:user');
    url.searchParams.set('state', state);

    return { url: url.toString() };
  });

  // ─── GitHub OAuth initiation (legacy redirect — garde pour compat) ────────
  fastify.get('/github/oauth', auth, async (request, reply) => {
    const settings = await getOAuthSettings();
    if (!settings.github.clientId) {
      return reply.code(400).send({ error: 'GitHub OAuth not configured. Add githubClientId and githubClientSecret in Settings.' });
    }
    const { sub: userId } = request.user;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const redirectUri = `${settings.appUrl}/api/git/github/callback`;

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', settings.github.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'repo read:user');
    url.searchParams.set('state', state);

    return reply.redirect(url.toString());
  });

  // ─── GitHub OAuth callback ────────────────────────────────────────────────
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/github/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;
      if (error || !code || !state) {
        return reply.redirect(`/git-sources?error=${encodeURIComponent(error ?? 'OAuth cancelled')}`);
      }

      let userId: string;
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
        userId = parsed.userId;
      } catch {
        return reply.redirect('/git-sources?error=Invalid+state');
      }

      const settings = await getOAuthSettings();
      const redirectUri = `${settings.appUrl}/api/git/github/callback`;

      // Exchange code for access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: settings.github.clientId,
          client_secret: settings.github.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = await tokenRes.json() as any;
      if (tokenData.error || !tokenData.access_token) {
        return reply.redirect(`/git-sources?error=${encodeURIComponent(tokenData.error_description ?? 'Token exchange failed')}`);
      }

      const api = new GitHubApi(tokenData.access_token);
      const ghUser = await api.getUser();

      // Check if source already exists for this GitHub user
      const existing = await db.query.gitSources.findFirst({
        where: and(
          eq(schema.gitSources.userId, userId),
          eq(schema.gitSources.provider, 'github'),
          eq(schema.gitSources.providerId, String(ghUser.id)),
        ),
      });

      if (existing) {
        // Update token
        await db.update(schema.gitSources).set({
          accessToken: Buffer.from(tokenData.access_token).toString('base64'), // will be encrypted by service
          scopes: tokenData.scope,
          updatedAt: new Date(),
        }).where(eq(schema.gitSources.id, existing.id));
      } else {
        await createGitSource({
          userId,
          provider: 'github',
          name: ghUser.login,
          providerId: String(ghUser.id),
          username: ghUser.login,
          avatarUrl: ghUser.avatar_url,
          accessToken: tokenData.access_token,
          scopes: tokenData.scope,
        });
      }

      return reply.redirect('/git-sources?connected=github');
    },
  );

  // ─── GitLab OAuth — retourne l'URL (fetch authentifié) ───────────────────
  fastify.get('/gitlab/oauth-url', auth, async (request, reply) => {
    const settings = await getOAuthSettings();
    if (!settings.gitlab.clientId) {
      return reply.code(400).send({ error: 'GitLab OAuth non configuré.' });
    }
    const { sub: userId } = request.user;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const redirectUri = `${settings.appUrl}/api/git/gitlab/callback`;

    const url = new URL(`${settings.gitlab.baseUrl}/oauth/authorize`);
    url.searchParams.set('client_id', settings.gitlab.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'read_api read_repository');
    url.searchParams.set('state', state);

    return { url: url.toString() };
  });

  // ─── GitLab OAuth initiation (legacy redirect) ────────────────────────────
  fastify.get('/gitlab/oauth', auth, async (request, reply) => {
    const settings = await getOAuthSettings();
    if (!settings.gitlab.clientId) {
      return reply.code(400).send({ error: 'GitLab OAuth not configured.' });
    }
    const { sub: userId } = request.user;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const redirectUri = `${settings.appUrl}/api/git/gitlab/callback`;

    const url = new URL(`${settings.gitlab.baseUrl}/oauth/authorize`);
    url.searchParams.set('client_id', settings.gitlab.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'read_api read_repository');
    url.searchParams.set('state', state);

    return reply.redirect(url.toString());
  });

  // ─── GitLab OAuth callback ────────────────────────────────────────────────
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/gitlab/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;
      if (error || !code || !state) {
        return reply.redirect(`/git-sources?error=${encodeURIComponent(error ?? 'OAuth cancelled')}`);
      }

      let userId: string;
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
        userId = parsed.userId;
      } catch {
        return reply.redirect('/git-sources?error=Invalid+state');
      }

      const settings = await getOAuthSettings();
      const redirectUri = `${settings.appUrl}/api/git/gitlab/callback`;

      const tokenRes = await fetch(`${settings.gitlab.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: settings.gitlab.clientId,
          client_secret: settings.gitlab.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) {
        return reply.redirect('/git-sources?error=Token+exchange+failed');
      }

      const api = new GitLabApi(tokenData.access_token, settings.gitlab.baseUrl);
      const glUser = await api.getUser();

      await createGitSource({
        userId,
        provider: 'gitlab',
        name: glUser.username,
        providerId: String(glUser.id),
        username: glUser.username,
        avatarUrl: glUser.avatar_url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        scopes: 'read_api read_repository',
      });

      return reply.redirect('/git-sources?connected=gitlab');
    },
  );

  // ─── Add PAT source (manual token without OAuth) ──────────────────────────
  fastify.post<{ Body: { provider: string; name: string; accessToken: string; baseUrl?: string } }>(
    '/sources',
    auth,
    async (request, reply) => {
      const { sub: userId } = request.user;
      const { provider, name, accessToken, baseUrl } = request.body;

      if (!provider || !accessToken) {
        return reply.code(400).send({ error: 'provider and accessToken are required' });
      }

      // Validate token
      let username: string | undefined;
      let providerId: string | undefined;
      let avatarUrl: string | undefined;

      try {
        if (provider === 'github') {
          const api = new GitHubApi(accessToken);
          const user = await api.getUser();
          username = user.login;
          providerId = String(user.id);
          avatarUrl = user.avatar_url;
        } else if (provider === 'gitlab') {
          const api = new GitLabApi(accessToken, baseUrl ?? 'https://gitlab.com');
          const user = await api.getUser();
          username = user.username;
          providerId = String(user.id);
          avatarUrl = user.avatar_url;
        } else {
          return reply.code(400).send({ error: 'Unsupported provider' });
        }
      } catch (err: any) {
        return reply.code(400).send({ error: `Invalid token: ${err.message}` });
      }

      const source = await createGitSource({
        userId,
        provider: provider as 'github' | 'gitlab',
        name: name || username || provider,
        providerId,
        username,
        avatarUrl,
        accessToken,
      });

      const { accessToken: _, refreshToken: __, ...safe } = source;
      return reply.code(201).send(safe);
    },
  );

  // ─── List repositories for a git source ──────────────────────────────────
  fastify.get<{ Params: { sourceId: string }; Querystring: { page?: string } }>(
    '/:sourceId/repos',
    auth,
    async (request, reply) => {
      const { sub: userId } = request.user;
      const source = await db.query.gitSources.findFirst({
        where: and(
          eq(schema.gitSources.id, request.params.sourceId),
          eq(schema.gitSources.userId, userId),
        ),
      });
      if (!source) return reply.code(404).send({ error: 'Git source not found' });

      const page = parseInt(request.query.page ?? '1', 10);
      const api = makeGitApi(source);
      const repos = await (api as any).listRepos(page);
      return repos;
    },
  );

  // ─── List branches for a repo ─────────────────────────────────────────────
  fastify.get<{ Params: { sourceId: string }; Querystring: { repo: string } }>(
    '/:sourceId/branches',
    auth,
    async (request, reply) => {
      const { sub: userId } = request.user;
      const source = await db.query.gitSources.findFirst({
        where: and(
          eq(schema.gitSources.id, request.params.sourceId),
          eq(schema.gitSources.userId, userId),
        ),
      });
      if (!source) return reply.code(404).send({ error: 'Git source not found' });

      const { repo } = request.query;
      if (!repo) return reply.code(400).send({ error: 'repo query param required' });

      const api = makeGitApi(source);
      if (source.provider === 'github') {
        const [owner, repoName] = repo.split('/');
        const branches = await (api as GitHubApi).listBranches(owner, repoName);
        return branches;
      } else {
        const branches = await (api as GitLabApi).listBranches(repo);
        return branches;
      }
    },
  );

  // ─── Auto-detect build type for a repo ───────────────────────────────────
  fastify.get<{ Params: { sourceId: string }; Querystring: { repo: string; branch?: string } }>(
    '/:sourceId/detect',
    auth,
    async (request, reply) => {
      const { sub: userId } = request.user;
      const source = await db.query.gitSources.findFirst({
        where: and(
          eq(schema.gitSources.id, request.params.sourceId),
          eq(schema.gitSources.userId, userId),
        ),
      });
      if (!source) return reply.code(404).send({ error: 'Git source not found' });

      const { repo, branch = 'main' } = request.query;
      if (!repo) return reply.code(400).send({ error: 'repo query param required' });

      const api = makeGitApi(source);
      if (source.provider === 'github') {
        const [owner, repoName] = repo.split('/');
        const result = await (api as GitHubApi).detectBuild(owner, repoName, branch);
        return result;
      } else {
        const result = await (api as GitLabApi).detectBuild(repo, branch);
        return result;
      }
    },
  );

  // ─── Create webhook for an app ────────────────────────────────────────────
  fastify.post<{ Body: { appId: string } }>(
    '/webhook/setup',
    auth,
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (role !== 'super-admin' && role !== 'admin') return reply.code(403).send({ error: 'Admin only' });

      const { appId } = request.body;
      const app = await db.query.applications.findFirst({
        where: eq(schema.applications.id, appId),
      });
      if (!app || app.type !== 'git' || !app.gitSourceId || !app.gitRepoUrl) {
        return reply.code(400).send({ error: 'App must be a git-type app with a source and repo URL' });
      }

      const source = await db.query.gitSources.findFirst({
        where: eq(schema.gitSources.id, app.gitSourceId),
      });
      if (!source) return reply.code(404).send({ error: 'Git source not found' });

      const webhookSecret = generateWebhookSecret();
      const settings = await db.query.settings.findMany();
      const s: Record<string, string> = {};
      for (const r of settings) s[r.key] = r.value;
      const appUrl = s['interfaceDomain']
        ? `https://${s['interfaceDomain']}`
        : `http://localhost:${process.env.PORT ?? 3001}`;
      const webhookUrl = `${appUrl}/api/webhooks/${source.provider}/${appId}`;

      const api = makeGitApi(source);
      let hookId: number;

      if (source.provider === 'github') {
        const repoUrl = new URL(app.gitRepoUrl.startsWith('http') ? app.gitRepoUrl : `https://${app.gitRepoUrl}`);
        const parts = repoUrl.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
        hookId = await (api as GitHubApi).createWebhook(parts[0], parts[1], webhookUrl, webhookSecret);
      } else {
        const repoId = encodeURIComponent(app.gitRepoUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, ''));
        hookId = await (api as GitLabApi).createWebhook(repoId, webhookUrl, webhookSecret);
      }

      await db.update(schema.applications).set({
        webhookSecret,
        autoDeploy: true,
        updatedAt: new Date(),
      }).where(eq(schema.applications.id, appId));

      return { ok: true, hookId, webhookUrl };
    },
  );
}
