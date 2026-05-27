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

  update: (id: string, data: { name?: string; description?: string }) =>
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
  createUser: (projectId: string, data: { email: string; password: string; projectRole: string }) =>
    http.post<{ user: { id: string; email: string; role: string }; membership: unknown }>(
      `/api/projects/${projectId}/users`,
      data,
    ).then((r) => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => http.get<User[]>('/api/users').then((r) => r.data),

  create: (data: { email: string; password: string; role?: 'admin' | 'viewer' }) =>
    http.post<User>('/api/users', data).then((r) => r.data),

  update: (id: string, data: { email?: string; role?: string; password?: string; currentPassword?: string }) =>
    http.patch<User>(`/api/users/${id}`, data).then((r) => r.data),

  delete: (id: string) => http.delete(`/api/users/${id}`),
};

// ─── WebSocket log stream ─────────────────────────────────────────────────────

export function createLogStream(appId: string, onLine: (line: string) => void): WebSocket {
  const token = localStorage.getItem('token') ?? '';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  const ws = new WebSocket(`${proto}://${host}/api/apps/${appId}/logs/stream?token=${token}`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as { type: string; data: string };
      if (msg.type === 'log' || msg.type === 'info') onLine(msg.data);
    } catch {
      onLine(event.data);
    }
  };

  return ws;
}
