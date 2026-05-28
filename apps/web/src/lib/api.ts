import axios from 'axios';
import type {
  Application,
  Deployment,
  User,
  AppStatusInfo,
  AppMember,
  AppMyRole,
  NodeInfo,
  ClusterSettings,
  CreateAppInput,
  UpdateAppInput,
  LoginInput,
  RegisterInput,
  ApiKey,
  ApiKeyCreated,
  NotificationChannel,
  AlertRule,
  BackupConfig,
  BackupRun,
  GitSource,
  GitRepo,
  GitBranch,
  DetectedBuild,
  S3Storage,
  S3TestResult,
} from '@appk3s/shared';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (data: LoginInput) =>
    http.post<{ token: string; user: User }>('/api/auth/login', data).then((r) => r.data),

  register: (data: RegisterInput) =>
    http.post<{ token: string; user: User }>('/api/auth/register', data).then((r) => r.data),

  me: () => http.get<User>('/api/auth/me').then((r) => r.data),

  setupStatus: () =>
    http.get<{ setupRequired: boolean }>('/api/auth/setup-status').then((r) => r.data),
};

// ─── Applications ────────────────────────────────────────────────────────────

export const appsApi = {
  list: () => http.get<Application[]>('/api/apps').then((r) => r.data),

  get: (id: string) => http.get<Application>(`/api/apps/${id}`).then((r) => r.data),

  create: (data: CreateAppInput) =>
    http.post<Application>('/api/apps', data).then((r) => r.data),

  update: (id: string, data: UpdateAppInput) =>
    http.patch<Application>(`/api/apps/${id}`, data).then((r) => r.data),

  delete: (id: string) => http.delete(`/api/apps/${id}`),

  deploy: (id: string) =>
    http.post<Deployment>(`/api/apps/${id}/deploy`).then((r) => r.data),

  start: (id: string) => http.post(`/api/apps/${id}/start`).then((r) => r.data),
  stop: (id: string) => http.post(`/api/apps/${id}/stop`).then((r) => r.data),
  restart: (id: string) => http.post(`/api/apps/${id}/restart`).then((r) => r.data),

  status: (id: string) =>
    http.get<AppStatusInfo>(`/api/apps/${id}/status`).then((r) => r.data),

  logs: (id: string, tail = 200) =>
    http.get<{ logs: string }>(`/api/apps/${id}/logs?tail=${tail}`).then((r) => r.data),

  deployments: (id: string) =>
    http.get<Deployment[]>(`/api/apps/${id}/deployments`).then((r) => r.data),

  rollback: (id: string, imageTag: string) =>
    http.post<Deployment>(`/api/apps/${id}/rollback`, { imageTag }).then((r) => r.data),

  setupWebhook: (id: string) =>
    http.post<{ secret: string; webhookUrl: string }>(`/api/apps/${id}/webhook/setup`).then((r) => r.data),

  // Rôle de l'utilisateur courant sur cette app
  getMyRole: (id: string) =>
    http.get<AppMyRole>(`/api/apps/${id}/my-role`).then((r) => r.data),

  // Gestion de l'équipe (admin ou owner)
  getMembers: (id: string) =>
    http.get<AppMember[]>(`/api/apps/${id}/members`).then((r) => r.data),

  inviteMember: (id: string, data: { userId: string; role: 'owner' | 'editor' | 'viewer' }) =>
    http.post(`/api/apps/${id}/members`, data).then((r) => r.data),

  updateMemberRole: (id: string, userId: string, role: 'owner' | 'editor' | 'viewer') =>
    http.patch(`/api/apps/${id}/members/${userId}`, { role }).then((r) => r.data),

  removeMember: (id: string, userId: string) =>
    http.delete(`/api/apps/${id}/members/${userId}`),
};

// ─── Nodes ───────────────────────────────────────────────────────────────────

export const nodesApi = {
  list: () => http.get<NodeInfo[]>('/api/nodes').then((r) => r.data),
  joinCommand: () =>
    http.get<{ command: string; masterIP: string; token: string }>('/api/nodes/join-command').then((r) => r.data),
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const settingsApi = {
  get: () => http.get<ClusterSettings>('/api/settings').then((r) => r.data),
  update: (data: Partial<ClusterSettings>) =>
    http.patch('/api/settings', data).then((r) => r.data),
  getCertStatus: () =>
    http.get<{ ready: boolean; message: string }>('/api/settings/cert-status').then((r) => r.data),
};

// ─── Templates ────────────────────────────────────────────────────────────────

export const templatesApi = {
  list: () => http.get<import('@appk3s/shared').AppTemplate[]>('/api/templates').then((r) => r.data),
};

// ─── Projects ────────────────────────────────────────────────────────────────

export const projectsApi = {
  list: () => http.get<import('@appk3s/shared').Project[]>('/api/projects').then((r) => r.data),

  get: (id: string) => http.get<import('@appk3s/shared').Project & { apps: any[] }>(`/api/projects/${id}`).then((r) => r.data),

  create: (data: { name: string; description?: string }) =>
    http.post<import('@appk3s/shared').Project>('/api/projects', data).then((r) => r.data),

  update: (id: string, data: { name?: string; description?: string; wildcardDomain?: string }) =>
    http.patch<import('@appk3s/shared').Project>(`/api/projects/${id}`, data).then((r) => r.data),

  delete: (id: string) => http.delete(`/api/projects/${id}`),

  getMembers: (id: string) => http.get<any[]>(`/api/projects/${id}/members`).then((r) => r.data),

  inviteMember: (id: string, data: { userId: string; role: string }) =>
    http.post(`/api/projects/${id}/members`, data).then((r) => r.data),

  updateMemberRole: (id: string, userId: string, role: string) =>
    http.patch(`/api/projects/${id}/members/${userId}`, { role }).then((r) => r.data),

  removeMember: (id: string, userId: string) =>
    http.delete(`/api/projects/${id}/members/${userId}`),

  getMyRole: (id: string) =>
    http.get<{ role: 'owner' | 'member' | 'viewer' | null; isAdmin: boolean }>(`/api/projects/${id}/my-role`).then((r) => r.data),

  /** Crée un nouveau compte utilisateur et l'ajoute directement au projet */
  createUser: (projectId: string, data: { email: string; projectRole: string }) =>
    http.post<{ user: { id: string; email: string; role: string; emailSent?: boolean }; membership: unknown }>(
      `/api/projects/${projectId}/users`,
      data,
    ).then((r) => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => http.get<User[]>('/api/users').then((r) => r.data),

  create: (data: {
    email: string;
    role?: 'admin' | 'viewer';
    projects?: 'all' | Array<{ projectId: string; projectRole: string }>;
  }) =>
    http.post<User & { emailSent?: boolean; projectsAssigned?: number }>('/api/users', data).then((r) => r.data),

  update: (id: string, data: { email?: string; role?: string; password?: string; currentPassword?: string }) =>
    http.patch<User>(`/api/users/${id}`, data).then((r) => r.data),

  delete: (id: string) => http.delete(`/api/users/${id}`),
};

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeysApi = {
  list: () => http.get<ApiKey[]>('/api/auth/api-keys').then((r) => r.data),

  create: (data: { name: string; expiresAt?: string }) =>
    http.post<ApiKeyCreated>('/api/auth/api-keys', data).then((r) => r.data),

  revoke: (id: string) => http.delete(`/api/auth/api-keys/${id}`),
};

// ─── Terminal ─────────────────────────────────────────────────────────────────

export const terminalApi = {
  listPods: (appId: string) =>
    http.get<string[]>(`/api/apps/${appId}/terminal/pods`).then((r) => r.data),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  listChannels: () =>
    http.get<NotificationChannel[]>('/api/notifications/channels').then((r) => r.data),

  createChannel: (data: {
    name: string;
    type: string;
    config: Record<string, string>;
    events?: string[];
    enabled?: boolean;
  }) => http.post<NotificationChannel>('/api/notifications/channels', data).then((r) => r.data),

  updateChannel: (id: string, data: Partial<NotificationChannel>) =>
    http.patch<NotificationChannel>(`/api/notifications/channels/${id}`, data).then((r) => r.data),

  deleteChannel: (id: string) => http.delete(`/api/notifications/channels/${id}`),

  testChannel: (id: string) =>
    http.post<{ ok: boolean }>(`/api/notifications/channels/${id}/test`).then((r) => r.data),
};

// ─── Monitoring ───────────────────────────────────────────────────────────────

export const monitoringApi = {
  getNodeMetrics: () =>
    http.get<Array<NodeInfo & { cpuPercent: number | null; memoryPercent: number | null }>>('/api/monitoring/metrics/nodes').then((r) => r.data),

  getAppMetrics: (appId: string) =>
    http.get<{
      appId: string;
      appName: string;
      pods: Array<{ name: string; phase: string; ready: boolean; restarts: number; age: string; node: string }>;
      totalPods: number;
      runningPods: number;
      totalRestarts: number;
    }>(`/api/monitoring/metrics/apps/${appId}`).then((r) => r.data),

  listAlerts: () =>
    http.get<AlertRule[]>('/api/monitoring/alerts').then((r) => r.data),

  createAlert: (data: {
    name: string;
    metric: string;
    operator: string;
    threshold: number;
    durationMinutes?: number;
    appId?: string;
  }) => http.post<AlertRule>('/api/monitoring/alerts', data).then((r) => r.data),

  updateAlert: (id: string, data: Partial<AlertRule>) =>
    http.patch<AlertRule>(`/api/monitoring/alerts/${id}`, data).then((r) => r.data),

  deleteAlert: (id: string) => http.delete(`/api/monitoring/alerts/${id}`),
};

// ─── Backups ──────────────────────────────────────────────────────────────────

export const backupsApi = {
  list: () => http.get<BackupConfig[]>('/api/backups').then((r) => r.data),

  create: (data: {
    appId: string;
    name: string;
    schedule: string;
    destination: 'local' | 's3';
    s3Config?: {
      bucket: string;
      region: string;
      endpoint?: string;
      accessKey: string;
      secretKey: string;
      prefix?: string;
    };
    localPath?: string;
    retentionDays?: number;
  }) => http.post<BackupConfig>('/api/backups', data).then((r) => r.data),

  update: (id: string, data: Partial<BackupConfig>) =>
    http.patch<BackupConfig>(`/api/backups/${id}`, data).then((r) => r.data),

  delete: (id: string) => http.delete(`/api/backups/${id}`),

  listRuns: (id: string) =>
    http.get<BackupRun[]>(`/api/backups/${id}/runs`).then((r) => r.data),

  triggerRun: (id: string) =>
    http.post<{ ok: boolean; message: string }>(`/api/backups/${id}/run`).then((r) => r.data),
};

// ─── Git Sources ─────────────────────────────────────────────────────────────

export const gitApi = {
  /** List git sources for the current user. */
  listSources: () =>
    http.get<GitSource[]>('/api/git').then((r) => r.data),

  /** Add a PAT-based git source (no OAuth). */
  addSource: (data: { provider: string; name: string; accessToken: string; baseUrl?: string }) =>
    http.post<GitSource>('/api/git/sources', data).then((r) => r.data),

  /** Delete a git source. */
  deleteSource: (id: string) => http.delete(`/api/git/${id}`),

  /**
   * Fetch the GitHub OAuth URL (authenticated call) then redirect the browser.
   * Returns the URL so the caller can do window.location.href = url.
   */
  getGithubOAuthUrl: () =>
    http.get<{ url: string }>('/api/git/github/oauth-url').then((r) => r.data.url),

  /**
   * Fetch the GitLab OAuth URL (authenticated call) then redirect the browser.
   */
  getGitlabOAuthUrl: () =>
    http.get<{ url: string }>('/api/git/gitlab/oauth-url').then((r) => r.data.url),

  /** List repos for a source. */
  listRepos: (sourceId: string, page = 1) =>
    http.get<GitRepo[]>(`/api/git/${sourceId}/repos?page=${page}`).then((r) => r.data),

  /** List branches for a repo. */
  listBranches: (sourceId: string, repo: string) =>
    http.get<GitBranch[]>(`/api/git/${sourceId}/branches?repo=${encodeURIComponent(repo)}`).then((r) => r.data),

  /** Auto-detect build type from repo tree. */
  detectBuild: (sourceId: string, repo: string, branch = 'main') =>
    http.get<DetectedBuild>(`/api/git/${sourceId}/detect?repo=${encodeURIComponent(repo)}&branch=${branch}`).then((r) => r.data),

  /** Setup webhook on GitHub/GitLab for auto-deploy. */
  setupWebhook: (appId: string) =>
    http.post<{ ok: boolean; hookId: number; webhookUrl: string }>('/api/git/webhook/setup', { appId }).then((r) => r.data),
};

// ─── GitHub App API ───────────────────────────────────────────────────────────

import type { GithubAppInfo, GithubInstallation } from '@appk3s/shared';

export const githubAppApi = {
  /** Get GitHub App info (admin). */
  getApp: () => http.get<GithubAppInfo>('/api/github-app').then((r) => r.data),

  /** Get manifest data to build the form. */
  getManifestData: () =>
    http.get<{ manifest: string; githubUrl: string; state: string }>('/api/github-app/manifest-data').then((r) => r.data),

  /** Delete the GitHub App (admin). */
  deleteApp: () => http.delete('/api/github-app'),

  /** Get GitHub install URL. */
  getInstallUrl: () =>
    http.get<{ url: string }>('/api/github-app/install-url').then((r) => r.data.url),

  /** Register an installation after the user installs the app on GitHub. */
  registerInstallation: (installationId: number) =>
    http.post<{ id: string; installationId: number; login: string }>(
      '/api/github-app/installations',
      { installationId },
    ).then((r) => r.data),

  /** List all installations. */
  listInstallations: () =>
    http.get<GithubInstallation[]>('/api/github-app/installations').then((r) => r.data),

  /** Delete an installation. */
  deleteInstallation: (id: string) => http.delete(`/api/github-app/installations/${id}`),

  /** List repos accessible via an installation. */
  listRepos: (installationId: string) =>
    http.get<GitRepo[]>(`/api/github-app/installations/${installationId}/repos`).then((r) => r.data),

  /** List branches for a repo. */
  listBranches: (installationId: string, repo: string) =>
    http.get<GitBranch[]>(`/api/github-app/installations/${installationId}/branches?repo=${encodeURIComponent(repo)}`).then((r) => r.data),

  /** Auto-detect build type. */
  detectBuild: (installationId: string, repo: string, branch = 'main') =>
    http.get<DetectedBuild>(`/api/github-app/installations/${installationId}/detect?repo=${encodeURIComponent(repo)}&branch=${branch}`).then((r) => r.data),
};

// ─── S3 Storage ───────────────────────────────────────────────────────────────

export const s3Api = {
  list: () => http.get<S3Storage[]>('/api/s3').then((r) => r.data),

  get: (id: string) => http.get<S3Storage>(`/api/s3/${id}`).then((r) => r.data),

  create: (data: {
    name: string;
    description?: string;
    endpoint: string;
    region?: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    pathStyle?: boolean;
  }) => http.post<S3Storage>('/api/s3', data).then((r) => r.data),

  update: (id: string, data: Partial<{
    name: string;
    description: string;
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    pathStyle: boolean;
  }>) => http.patch<S3Storage>(`/api/s3/${id}`, data).then((r) => r.data),

  delete: (id: string) => http.delete(`/api/s3/${id}`),

  test: (id: string) => http.post<S3TestResult>(`/api/s3/${id}/test`).then((r) => r.data),

  testConfig: (data: {
    endpoint: string;
    region?: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    pathStyle?: boolean;
  }) => http.post<S3TestResult>('/api/s3/test', data).then((r) => r.data),

  setDefault: (id: string) => http.post(`/api/s3/${id}/set-default`).then((r) => r.data),
};

// ─── WebSocket log stream ─────────────────────────────────────────────────────

export function createLogStream(
  appId: string,
  onMessage: (msg: { type: string; data: string; pod?: string }) => void,
): WebSocket {
  const token = localStorage.getItem('token') ?? '';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  const ws = new WebSocket(`${proto}://${host}/api/apps/${appId}/logs/stream?token=${token}`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as { type: string; data: string; pod?: string };
      onMessage(msg);
    } catch {
      onMessage({ type: 'log', data: event.data });
    }
  };

  return ws;
}

/**
 * Polls a deployment's logs until it completes or a given timeout.
 * Calls onLine for each new line, onDone when finished.
 */
export function pollDeploymentLogs(
  appId: string,
  deploymentId: string,
  onLine: (line: string) => void,
  onDone: (status: 'success' | 'failed') => void,
): () => void {
  let seen = 0;
  let active = true;

  const poll = async () => {
    if (!active) return;
    try {
      const deployments = await appsApi.deployments(appId);
      const dep = deployments.find((d) => d.id === deploymentId);
      if (!dep) return;

      const lines = dep.logs.split('\n').filter(Boolean);
      for (let i = seen; i < lines.length; i++) {
        onLine(lines[i]);
      }
      seen = lines.length;

      if (dep.status === 'success' || dep.status === 'failed') {
        onDone(dep.status as 'success' | 'failed');
        active = false;
        return;
      }
    } catch { /* ignore */ }

    if (active) setTimeout(poll, 1500);
  };

  poll();
  return () => { active = false; };
}
