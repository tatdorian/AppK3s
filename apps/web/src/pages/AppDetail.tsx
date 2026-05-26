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
  Save,
} from 'lucide-react';
import { useApp, useAppStatus, useDeployments, useUpdateApp, useDeleteApp } from '../hooks/useApps.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsApi } from '../lib/api.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { LogsViewer } from '../components/LogsViewer.js';
import { EnvVarsEditor } from '../components/EnvVarsEditor.js';
import { formatDate, relativeTime } from '../lib/utils.js';
import { useAuthStore } from '../store/auth.js';
import type { EnvVar, Port, SetPermissionInput } from '@appk3s/shared';
import { TEMPLATES } from '@appk3s/shared';
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

  // Permissions tab data (admin only)
  const { data: permUsers = [], refetch: refetchPerms } = useQuery({
    queryKey: ['app-permissions', id],
    queryFn: () => appsApi.getPermissions(id!),
    enabled: isAdmin && !!id,
  });

  // Local copy of permissions for editing (keyed by userId)
  const [permEdits, setPermEdits] = useState<Record<string, SetPermissionInput>>({});

  const savePermMut = useMutation({
    mutationFn: async () => {
      await Promise.all(
        Object.entries(permEdits).map(([userId, data]) =>
          appsApi.setPermission(id!, userId, data),
        ),
      );
    },
    onSuccess: () => {
      toast.success('Droits sauvegardés');
      setPermEdits({});
      refetchPerms();
    },
    onError: () => toast.error('Échec de la sauvegarde'),
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

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'config', label: 'Configuration' },
    { id: 'environment', label: 'Env Vars' },
    { id: 'logs', label: 'Logs' },
    { id: 'deployments', label: 'Déploiements' },
    { id: 'access', label: 'Accès', adminOnly: true },
  ];

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

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="btn-primary py-2"
            onClick={() => deployMut.mutate()}
            disabled={app.status === 'deploying' || deployMut.isPending}
          >
            <Rocket className="w-4 h-4" />
            Deploy
          </button>
          {app.status === 'stopped' || app.status === 'idle' ? (
            <button className="btn-ghost py-2" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
              <Play className="w-4 h-4 text-emerald-400" /> Start
            </button>
          ) : (
            <button className="btn-ghost py-2" onClick={() => stopMut.mutate()} disabled={app.status !== 'running' || stopMut.isPending}>
              <Square className="w-4 h-4 text-yellow-400" /> Stop
            </button>
          )}
          <button className="btn-ghost py-2" onClick={() => restartMut.mutate()} disabled={app.status !== 'running' || restartMut.isPending}>
            <RotateCcw className="w-4 h-4" /> Restart
          </button>
          <button
            className={confirmDel ? 'btn-danger' : 'btn-ghost py-2'}
            onClick={handleDelete}
            disabled={deleteMut.isPending}
          >
            <Trash2 className="w-4 h-4" />
            {confirmDel ? 'Confirmer?' : ''}
          </button>
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
          {tabs.filter((t) => !t.adminOnly || isAdmin).map((t) => (
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

          {/* Ports */}
          {app.type === 'docker-image' && (
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

      {/* ── Accès ────────────────────────────────────────────────────────────── */}
      {tab === 'access' && isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Droits d'accès par utilisateur</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Les admins ont toujours accès complet. Configurez ici les droits des autres rôles.
              </p>
            </div>
            {Object.keys(permEdits).length > 0 && (
              <button
                className="btn-primary py-1.5 text-sm"
                onClick={() => savePermMut.mutate()}
                disabled={savePermMut.isPending}
              >
                <Save className="w-3.5 h-3.5" />
                {savePermMut.isPending ? 'Sauvegarde...' : 'Sauvegarder les droits'}
              </button>
            )}
          </div>

          {permUsers.length === 0 ? (
            <div className="card p-6 text-center text-slate-500 text-sm">
              Aucun autre utilisateur. Créez des utilisateurs dans les Paramètres.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/40">
                    <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Utilisateur</th>
                    <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Voir</th>
                    <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Déployer</th>
                    <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Modifier</th>
                    <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Supprimer</th>
                  </tr>
                </thead>
                <tbody>
                  {permUsers.map((u: any) => {
                    // Valeurs en cours d'édition ou valeurs serveur
                    const cur: SetPermissionInput = permEdits[u.userId] ?? {
                      canView:   u.canView,
                      canDeploy: u.canDeploy,
                      canEdit:   u.canEdit,
                      canDelete: u.canDelete,
                    };
                    const isDirty = !!permEdits[u.userId];

                    const setPerm = (field: keyof SetPermissionInput, val: boolean) => {
                      setPermEdits((prev) => ({
                        ...prev,
                        [u.userId]: { ...cur, [field]: val },
                      }));
                    };

                    return (
                      <tr
                        key={u.userId}
                        className={`border-b border-slate-700/20 last:border-0 transition-colors ${
                          isDirty ? 'bg-accent/5' : 'hover:bg-surface-200/30'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
                              {u.email[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm text-white">{u.email}</p>
                              <p className="text-xs text-slate-500">{u.role}</p>
                            </div>
                            {isDirty && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">modifié</span>
                            )}
                          </div>
                        </td>
                        {(['canView', 'canDeploy', 'canEdit', 'canDelete'] as const).map((field) => (
                          <td key={field} className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={cur[field]}
                              onChange={(e) => setPerm(field, e.target.checked)}
                              className="w-4 h-4 rounded accent-accent cursor-pointer"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-slate-600">
            💡 <strong className="text-slate-500">Voir</strong> = accès lecture (liste, logs, status) ·{' '}
            <strong className="text-slate-500">Déployer</strong> = deploy / start / stop / restart ·{' '}
            <strong className="text-slate-500">Modifier</strong> = config & env vars ·{' '}
            <strong className="text-slate-500">Supprimer</strong> = suppression de l'app
          </p>
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
                  {['ID', 'Statut', 'Démarré', 'Terminé'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id} className="border-b border-slate-700/20 last:border-0 hover:bg-surface-200/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{d.id.slice(0, 8)}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} size="sm" /></td>
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
