import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Globe,
  Rocket,
  Loader2,
  ExternalLink,
  Network,
  Server,
  Settings,
  Plus,
  Minus,
  AlertTriangle,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { useApp, useAppStatus, useDeployments, useUpdateApp, useDeleteApp } from '../hooks/useApps.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsApi, usersApi, projectsApi } from '../lib/api.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { LogsViewer } from '../components/LogsViewer.js';
import { EnvVarsEditor } from '../components/EnvVarsEditor.js';
import { formatDate, relativeTime } from '../lib/utils.js';
import { useAuthStore } from '../store/auth.js';
import { useAppPermissions } from '../hooks/usePermissions.js';
import type { EnvVar, Port } from '@appk3s/shared';
import { TEMPLATES, IMAGE_PORT_MAP } from '@appk3s/shared';
import toast from 'react-hot-toast';

type Tab = 'overview' | 'config' | 'environment' | 'logs' | 'deployments' | 'access';

interface ConfigForm {
  name: string;
  image: string;
  imageTag: string;
  composeContent: string;
  subdomain: string;
  domain: string;
  ingressClass: string;
  tlsEnabled: boolean;
  ports: Port[];
  replicas: number;
  cpuLimit: string;
  memoryLimit: string;
}

export function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<Tab>('overview');
  const [envVars, setEnvVars] = useState<EnvVar[] | null>(null);
  const [configForm, setConfigForm] = useState<ConfigForm | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const { data: app, isLoading } = useApp(id!);
  const { data: status } = useAppStatus(id!);
  const { data: deployments = [] } = useDeployments(id!);
  const updateMut = useUpdateApp(id!);
  const deleteMut = useDeleteApp();

  // Per-app role/capabilities for the current user
  const perms = useAppPermissions(id!);

  // Project role (needed to restrict domain/ports for 'member' role)
  const { data: projectRoleData } = useQuery({
    queryKey: ['projects', app?.projectId, 'my-role'],
    queryFn: () => projectsApi.getMyRole(app!.projectId!),
    enabled: !!app?.projectId && !isAdmin,
  });
  // Owners and admins can modify domain/ingress/ports; plain members cannot
  const canSetDomain = isAdmin || !app?.projectId || projectRoleData?.role === 'owner' || perms.role === 'owner' || perms.role === 'editor';

  // Members list for access tab (owner or admin)
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ['app-members', id],
    queryFn: () => appsApi.getMembers(id!),
    enabled: (isAdmin || perms.canManageTeam) && !!id,
  });

  // Users list for invite dropdown (admin only — admins see all users)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: isAdmin && !!id,
  });

  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');

  const inviteMut = useMutation({
    mutationFn: () => appsApi.inviteMember(id!, { userId: inviteUserId, role: inviteRole }),
    onSuccess: () => { toast.success('Membre ajouté'); setInviteUserId(''); refetchMembers(); },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur'),
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      appsApi.updateMemberRole(id!, userId, role as 'owner' | 'editor' | 'viewer'),
    onSuccess: () => { toast.success('Rôle mis à jour'); refetchMembers(); },
    onError: () => toast.error('Erreur de mise à jour'),
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => appsApi.removeMember(id!, userId),
    onSuccess: () => { toast.success('Membre retiré'); refetchMembers(); },
    onError: () => toast.error('Erreur de suppression'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['apps', id] });

  const deployMut = useMutation({
    mutationFn: () => appsApi.deploy(id!),
    onSuccess: () => { invalidate(); toast.success('Déploiement démarré'); },
    onError: () => toast.error('Échec du déploiement'),
  });
  const startMut = useMutation({
    mutationFn: () => appsApi.start(id!),
    onSuccess: () => { invalidate(); toast.success('Démarré'); },
    onError: () => toast.error('Échec du démarrage'),
  });
  const stopMut = useMutation({
    mutationFn: () => appsApi.stop(id!),
    onSuccess: () => { invalidate(); toast.success('Arrêté'); },
    onError: () => toast.error('Échec de l\'arrêt'),
  });
  const restartMut = useMutation({
    mutationFn: () => appsApi.restart(id!),
    onSuccess: () => { invalidate(); toast.success('Redémarré'); },
    onError: () => toast.error('Échec du redémarrage'),
  });

  // Init config form from app data (first time only)
  useEffect(() => {
    if (app && !configForm) {
      setConfigForm({
        name: app.name,
        image: app.image ?? '',
        imageTag: app.imageTag,
        composeContent: app.composeContent ?? '',
        subdomain: app.subdomain ?? '',
        domain: app.domain ?? '',
        ingressClass: app.ingressClass,
        tlsEnabled: app.tlsEnabled,
        ports: app.ports,
        replicas: app.replicas,
        cpuLimit: app.cpuLimit ?? '',
        memoryLimit: app.memoryLimit ?? '',
      });
    }
  }, [app]);

  if (isLoading || !app) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    );
  }

  const hostname = app.subdomain && app.domain ? `${app.subdomain}.${app.domain}` : null;
  const accessUrl = status?.accessUrl;
  const nameChanged = configForm?.name !== app.name;

  const tabs: { id: Tab; label: string; adminOnly?: boolean; ownerOnly?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'config', label: 'Configuration' },
    { id: 'environment', label: 'Env Vars' },
    { id: 'logs', label: 'Logs' },
    { id: 'deployments', label: 'Déploiements' },
    { id: 'access', label: 'Équipe', adminOnly: false, ownerOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (t.ownerOnly && !isAdmin && !perms.canManageTeam) return false;
    return true;
  });

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return; }
    await deleteMut.mutateAsync(app.id);
    navigate('/apps');
  };

  const saveEnv = async () => {
    if (!envVars) return;
    await updateMut.mutateAsync({ envVars });
    setEnvVars(null);
  };

  const resetConfig = () => {
    if (!app) return;
    setConfigForm({
      name: app.name,
      image: app.image ?? '',
      imageTag: app.imageTag,
      composeContent: app.composeContent ?? '',
      subdomain: app.subdomain ?? '',
      domain: app.domain ?? '',
      ingressClass: app.ingressClass,
      tlsEnabled: app.tlsEnabled,
      ports: app.ports,
      replicas: app.replicas,
      cpuLimit: app.cpuLimit ?? '',
      memoryLimit: app.memoryLimit ?? '',
    });
  };

  const saveConfig = async (andDeploy: boolean) => {
    if (!configForm) return;
    const payload = {
      name: configForm.name,
      image: configForm.image || undefined,
      imageTag: configForm.imageTag,
      composeContent: configForm.composeContent || undefined,
      subdomain: configForm.subdomain || undefined,
      domain: configForm.domain || undefined,
      ingressClass: configForm.ingressClass,
      tlsEnabled: configForm.tlsEnabled,
      ports: configForm.ports,
      replicas: configForm.replicas,
      cpuLimit: configForm.cpuLimit || undefined,
      memoryLimit: configForm.memoryLimit || undefined,
    };
    try {
      const updated = await updateMut.mutateAsync(payload);
      if (andDeploy) {
        await appsApi.deploy(updated.id);
        toast.success('Config sauvegardée — déploiement en cours');
      } else {
        toast.success('Configuration sauvegardée');
      }
      qc.invalidateQueries({ queryKey: ['apps', id] });
      // Resync form with server values
      setConfigForm(null);
    } catch {
      // toast handled by mutation
    }
  };

  const setPort = (i: number, val: Partial<Port>) =>
    setConfigForm((f) => f ? { ...f, ports: f.ports.map((p, idx) => idx === i ? { ...p, ...val } : p) } : f);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link to="/apps" className="btn-ghost p-2">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{app.name}</h1>
              <StatusBadge status={app.status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {app.namespace} ·{' '}
              {app.type === 'docker-image' ? `${app.image}:${app.imageTag}` : 'docker-compose'}
            </p>
          </div>
        </div>

        {/* Actions — gated by per-app capabilities */}
        <div className="flex items-center gap-2 shrink-0">
          {perms.canDeploy && (
            <button
              className="btn-primary py-2"
              onClick={() => deployMut.mutate()}
              disabled={app.status === 'deploying' || deployMut.isPending}
            >
              <Rocket className="w-4 h-4" />
              Deploy
            </button>
          )}
          {perms.canDeploy && (
            app.status === 'stopped' || app.status === 'idle' ? (
              <button className="btn-ghost py-2" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                <Play className="w-4 h-4 text-emerald-400" /> Start
              </button>
            ) : (
              <button className="btn-ghost py-2" onClick={() => stopMut.mutate()} disabled={app.status !== 'running' || stopMut.isPending}>
                <Square className="w-4 h-4 text-yellow-400" /> Stop
              </button>
            )
          )}
          {perms.canDeploy && (
            <button className="btn-ghost py-2" onClick={() => restartMut.mutate()} disabled={app.status !== 'running' || restartMut.isPending}>
              <RotateCcw className="w-4 h-4" /> Restart
            </button>
          )}
          {perms.canDelete && (
            <button
              className={confirmDel ? 'btn-danger' : 'btn-ghost py-2'}
              onClick={handleDelete}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="w-4 h-4" />
              {confirmDel ? 'Confirmer?' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Access URL banner */}
      {accessUrl && (
        <a
          href={accessUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/15 transition-colors"
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium truncate">{accessUrl}</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0 ml-auto" />
        </a>
      )}

      {/* Quick info bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-3">
          <p className="text-xs text-slate-500 mb-1">Pods</p>
          <p className="text-lg font-semibold text-white">
            {status?.readyReplicas ?? 0}/{status?.desiredReplicas ?? app.replicas}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500 mb-1">Namespace</p>
          <p className="text-sm font-medium text-white">{app.namespace}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500 mb-1">Créé</p>
          <p className="text-sm font-medium text-white">{relativeTime(app.createdAt)}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500 mb-1">Hostname</p>
          {hostname ? (
            <a
              href={`http${app.tlsEnabled ? 's' : ''}://${hostname}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent hover:underline flex items-center gap-1"
            >
              <Globe className="w-3 h-3" />
              {hostname}
            </a>
          ) : (
            <p className="text-sm text-slate-600">—</p>
          )}
        </div>
      </div>

      {/* Service ports */}
      {status?.servicePorts && status.servicePorts.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-3.5 h-3.5 text-slate-400" />
            <h3 className="text-sm font-semibold text-white">Ports du service</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {status.servicePorts.map((sp) => (
              <div key={sp.name} className="flex items-center gap-2 bg-surface-300 rounded-lg px-3 py-2">
                <div>
                  <span className="text-xs text-slate-400">{sp.name || 'port'}</span>
                  <div className="flex items-center gap-1 text-sm font-medium text-white">
                    <span>{sp.port}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-slate-300">{sp.targetPort}</span>
                    {sp.nodePort && (
                      <>
                        <span className="text-slate-500">·</span>
                        <span className="text-accent">NodePort {sp.nodePort}</span>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-slate-600">{sp.protocol}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700/50 mb-6">
        <nav className="flex gap-1">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.id === 'config' && <Settings className="w-3.5 h-3.5" />}
              {t.id === 'access' && <ShieldCheck className="w-3.5 h-3.5" />}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {status?.pods && status.pods.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/40">
                <h3 className="text-sm font-semibold text-white">Pods</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/40">
                    {['Nom', 'Phase', 'Ready', 'Restarts', 'Âge', 'Node'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {status.pods.map((pod) => (
                    <tr key={pod.name} className="border-b border-slate-700/20 last:border-0 hover:bg-surface-200/30">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 max-w-[200px] truncate">{pod.name}</td>
                      <td className="px-4 py-3"><StatusBadge status={pod.phase.toLowerCase()} size="sm" /></td>
                      <td className="px-4 py-3 text-xs">{pod.ready ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{pod.restarts}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{pod.age}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Server className="w-3 h-3" />
                          {pod.node || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {app.type === 'compose' && app.composeContent && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/40">
                <h3 className="text-sm font-semibold text-white">docker-compose.yml</h3>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto">{app.composeContent}</pre>
            </div>
          )}
          {(!status?.pods || status.pods.length === 0) && app.type !== 'compose' && (
            <div className="card p-6 text-center text-slate-500 text-sm">
              Aucun pod en cours — déployez l'application pour la démarrer.
            </div>
          )}
        </div>
      )}

      {/* ── Configuration ────────────────────────────────────────────────────── */}
      {tab === 'config' && configForm && (
        <div className="space-y-5">
          {/* Name change warning */}
          {nameChanged && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Renommer l'application supprimera les ressources k8s existantes. Un redéploiement est requis.
            </div>
          )}

          {/* General */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Général</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nom de l'application</label>
                <input
                  className="input"
                  value={configForm.name}
                  onChange={(e) => setConfigForm((f) => f ? { ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') } : f)}
                />
                <p className="text-xs text-slate-600 mt-1">minuscules, tirets uniquement</p>
              </div>
              <div>
                <label className="label">Replicas</label>
                <input
                  type="number"
                  className="input"
                  min={0} max={50}
                  value={configForm.replicas}
                  onChange={(e) => setConfigForm((f) => f ? { ...f, replicas: Number(e.target.value) } : f)}
                />
              </div>
            </div>

            {app.type === 'docker-image' ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="label">Image Docker</label>
                  <input
                    className="input"
                    placeholder="nginx"
                    value={configForm.image}
                    onChange={(e) => setConfigForm((f) => f ? { ...f, image: e.target.value } : f)}
                    onBlur={() => {
                      if (!configForm || configForm.ports.length > 0) return;
                      const imageBase = configForm.image.split(':')[0];
                      const match = TEMPLATES.find(
                        (t) => t.defaults.image === imageBase || t.defaults.image === configForm.image,
                      );
                      if (match && match.defaults.ports.length > 0) {
                        setConfigForm((f) => f ? { ...f, ports: [...match.defaults.ports] } : f);
                        return;
                      }
                      const port = IMAGE_PORT_MAP[imageBase] ?? IMAGE_PORT_MAP[configForm.image];
                      if (port) {
                        setConfigForm((f) => f ? { ...f, ports: [{ containerPort: port, protocol: 'TCP' }] } : f);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="label">Tag</label>
                  <input
                    className="input"
                    placeholder="latest"
                    value={configForm.imageTag}
                    onChange={(e) => setConfigForm((f) => f ? { ...f, imageTag: e.target.value } : f)}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="label">docker-compose.yml</label>
                <textarea
                  className="input font-mono text-xs h-48 resize-none"
                  value={configForm.composeContent}
                  onChange={(e) => setConfigForm((f) => f ? { ...f, composeContent: e.target.value } : f)}
                />
              </div>
            )}
          </div>

          {/* Domain */}
          {canSetDomain ? (
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Domaine & Ingress</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Sous-domaine</label>
                  <input
                    className="input"
                    placeholder={app.name}
                    value={configForm.subdomain}
                    onChange={(e) => setConfigForm((f) => f ? { ...f, subdomain: e.target.value } : f)}
                  />
                </div>
                <div>
                  <label className="label">Domaine wildcard</label>
                  <input
                    className="input"
                    placeholder="example.com"
                    value={configForm.domain}
                    onChange={(e) => setConfigForm((f) => f ? { ...f, domain: e.target.value } : f)}
                  />
                </div>
              </div>
              {configForm.subdomain && configForm.domain && (
                <p className="text-xs text-accent">
                  → URL : {configForm.tlsEnabled ? 'https' : 'http'}://{configForm.subdomain}.{configForm.domain}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Ingress Class</label>
                  <select
                    className="input"
                    value={configForm.ingressClass}
                    onChange={(e) => setConfigForm((f) => f ? { ...f, ingressClass: e.target.value } : f)}
                  >
                    <option value="traefik">Traefik (k3s default)</option>
                    <option value="nginx">nginx</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="tls-edit"
                    checked={configForm.tlsEnabled}
                    onChange={(e) => setConfigForm((f) => f ? { ...f, tlsEnabled: e.target.checked } : f)}
                    className="w-4 h-4 rounded accent-accent"
                  />
                  <label htmlFor="tls-edit" className="text-sm text-slate-300">Activer TLS (HTTPS)</label>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-4 flex items-center gap-3 text-slate-500 text-sm">
              <Lock className="w-4 h-4 shrink-0 text-slate-600" />
              <span>Domaine, Ingress et TLS — réservés aux Admin Projet et Admin Général.</span>
            </div>
          )}

          {/* Ports */}
          {app.type === 'docker-image' && canSetDomain && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Ports exposés</h2>
                <button
                  type="button"
                  onClick={() => setConfigForm((f) => f ? { ...f, ports: [...f.ports, { containerPort: 80, protocol: 'TCP' }] } : f)}
                  className="btn-ghost text-xs py-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter
                </button>
              </div>
              {configForm.ports.length === 0 && (
                <p className="text-xs text-slate-600">Aucun port — le port 80 sera utilisé par défaut.</p>
              )}
              {configForm.ports.map((p, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <input
                    type="number"
                    className="input"
                    placeholder="Port"
                    value={p.containerPort}
                    onChange={(e) => setPort(i, { containerPort: Number(e.target.value) })}
                  />
                  <select
                    className="input w-24 shrink-0"
                    value={p.protocol}
                    onChange={(e) => setPort(i, { protocol: e.target.value as 'TCP' | 'UDP' })}
                  >
                    <option>TCP</option>
                    <option>UDP</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setConfigForm((f) => f ? { ...f, ports: f.ports.filter((_, idx) => idx !== i) } : f)}
                    className="btn-danger p-2 shrink-0"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Resources */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Ressources</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Limite CPU</label>
                <input
                  className="input"
                  placeholder="500m"
                  value={configForm.cpuLimit}
                  onChange={(e) => setConfigForm((f) => f ? { ...f, cpuLimit: e.target.value } : f)}
                />
                <p className="text-xs text-slate-600 mt-1">ex : 500m, 1, 2</p>
              </div>
              <div>
                <label className="label">Limite Mémoire</label>
                <input
                  className="input"
                  placeholder="512Mi"
                  value={configForm.memoryLimit}
                  onChange={(e) => setConfigForm((f) => f ? { ...f, memoryLimit: e.target.value } : f)}
                />
                <p className="text-xs text-slate-600 mt-1">ex : 256Mi, 1Gi</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={resetConfig}
              className="btn-ghost text-sm"
            >
              Annuler les modifications
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => saveConfig(false)}
                disabled={updateMut.isPending}
                className="btn-ghost py-2"
              >
                Sauvegarder
              </button>
              <button
                type="button"
                onClick={() => saveConfig(true)}
                disabled={updateMut.isPending || deployMut.isPending}
                className="btn-primary py-2"
              >
                <Rocket className="w-4 h-4" />
                {updateMut.isPending ? 'Sauvegarde...' : 'Sauvegarder & Redéployer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Env Vars ─────────────────────────────────────────────────────────── */}
      {tab === 'environment' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Variables d'environnement</h3>
            {envVars !== null && (
              <div className="flex gap-2">
                <button className="btn-ghost text-sm py-1" onClick={() => setEnvVars(null)}>Annuler</button>
                <button className="btn-primary text-sm py-1" onClick={saveEnv} disabled={updateMut.isPending}>
                  Sauvegarder
                </button>
              </div>
            )}
          </div>
          <EnvVarsEditor
            value={envVars ?? app.envVars}
            onChange={(vars) => setEnvVars(vars)}
          />
          {envVars !== null && (
            <p className="text-xs text-slate-500">
              Après sauvegarde, redéployez l'application pour appliquer les nouvelles variables.
            </p>
          )}
        </div>
      )}

      {/* ── Logs ─────────────────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div className="card overflow-hidden h-[500px]">
          <LogsViewer appId={app.id} />
        </div>
      )}

      {/* ── Équipe / Accès ───────────────────────────────────────────────────── */}
      {tab === 'access' && (isAdmin || perms.canManageTeam) && (
        <div className="space-y-5">
          {/* Header */}
          <div>
            <h3 className="text-sm font-semibold text-white">Équipe & Permissions</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Les administrateurs globaux ont toujours un accès complet.
            </p>
          </div>

          {/* Invite form (admin only — only admins can see all users) */}
          {isAdmin && (
            <div className="card p-4 space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Inviter un utilisateur</h4>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="label">Utilisateur</label>
                  <select
                    className="input"
                    value={inviteUserId}
                    onChange={(e) => setInviteUserId(e.target.value)}
                  >
                    <option value="">Sélectionner...</option>
                    {(allUsers as any[])
                      .filter((u: any) => u.role !== 'admin' && !members.some((m: any) => m.userId === u.id && m.appRole !== null))
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>{u.email}</option>
                      ))
                    }
                  </select>
                </div>
                <div className="w-40">
                  <label className="label">Rôle</label>
                  <select
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'owner' | 'editor' | 'viewer')}
                  >
                    <option value="owner">Propriétaire</option>
                    <option value="editor">Éditeur</option>
                    <option value="viewer">Lecteur</option>
                  </select>
                </div>
                <button
                  className="btn-primary py-2"
                  onClick={() => inviteMut.mutate()}
                  disabled={!inviteUserId || inviteMut.isPending}
                >
                  Inviter
                </button>
              </div>
            </div>
          )}

          {/* Members table — shows project members + explicit per-app permissions */}
          {(() => {
            const PROJECT_ROLE_LABEL: Record<string, string> = {
              owner: '🔑 Admin Projet', member: '👤 Utilisateur', viewer: '👁 Lecteur',
            };
            const visibleMembers = (members as any[]).filter(
              (m: any) => m.appRole !== null || m.projectRole !== null,
            );
            return (
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/40">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Accès effectifs ({visibleMembers.length})
                  </h4>
                </div>
                {visibleMembers.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    {isAdmin
                      ? 'Aucun accès défini. Invitez des utilisateurs ci-dessus ou via le projet.'
                      : 'Aucun membre à afficher.'}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/40 bg-surface-200/20">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Utilisateur</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Accès projet</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Accès direct</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMembers.map((m: any) => (
                        <tr key={m.userId} className="border-b border-slate-700/20 last:border-0 hover:bg-surface-200/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
                                {(m.email as string)[0].toUpperCase()}
                              </div>
                              <p className="text-white text-sm">{m.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {m.projectRole ? (
                              <span className="text-slate-300">{PROJECT_ROLE_LABEL[m.projectRole] ?? m.projectRole}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {m.appRole ? (
                              <select
                                className="input py-1 text-xs w-36"
                                value={m.appRole}
                                onChange={(e) => updateRoleMut.mutate({ userId: m.userId, role: e.target.value })}
                                disabled={updateRoleMut.isPending}
                              >
                                <option value="owner">Propriétaire</option>
                                <option value="editor">Éditeur</option>
                                <option value="viewer">Lecteur</option>
                              </select>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {m.appRole && (
                              <button
                                className="btn-danger py-1 px-3 text-xs"
                                onClick={() => removeMemberMut.mutate(m.userId)}
                                disabled={removeMemberMut.isPending}
                              >
                                Retirer
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}

          {/* Role legend */}
          <div className="grid grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="card p-3 space-y-1">
              <p className="font-semibold text-white">Propriétaire</p>
              <p>Voir · Déployer · Modifier · Supprimer · Gérer l'équipe</p>
            </div>
            <div className="card p-3 space-y-1">
              <p className="font-semibold text-white">Éditeur</p>
              <p>Voir · Déployer · Modifier la config et les env vars</p>
            </div>
            <div className="card p-3 space-y-1">
              <p className="font-semibold text-white">Lecteur</p>
              <p>Voir les détails, les logs et le statut uniquement</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Deployments ──────────────────────────────────────────────────────── */}
      {tab === 'deployments' && (
        <div className="card overflow-hidden">
          {deployments.length === 0 ? (
            <p className="p-6 text-slate-500 text-sm">Aucun déploiement.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/40">
                  {['ID', 'Statut', 'Lancé par', 'Démarré', 'Terminé'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id} className="border-b border-slate-700/20 last:border-0 hover:bg-surface-200/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{d.id.slice(0, 8)}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} size="sm" /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {(d as any).triggeredByEmail ? (
                        <span className="text-slate-300">{(d as any).triggeredByEmail}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(d.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {d.completedAt ? formatDate(d.completedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
