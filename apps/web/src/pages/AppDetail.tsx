import { useState } from 'react';
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
} from 'lucide-react';
import { useApp, useAppStatus, useDeployments, useUpdateApp, useDeleteApp } from '../hooks/useApps.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appsApi } from '../lib/api.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { LogsViewer } from '../components/LogsViewer.js';
import { EnvVarsEditor } from '../components/EnvVarsEditor.js';
import { formatDate, relativeTime } from '../lib/utils.js';
import type { EnvVar } from '@appk3s/shared';
import toast from 'react-hot-toast';

type Tab = 'overview' | 'environment' | 'logs' | 'deployments';

export function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [envVars, setEnvVars] = useState<EnvVar[] | null>(null);

  const { data: app, isLoading } = useApp(id!);
  const { data: status } = useAppStatus(id!);
  const { data: deployments = [] } = useDeployments(id!);
  const updateMut = useUpdateApp(id!);
  const deleteMut = useDeleteApp();
  const [confirmDel, setConfirmDel] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['apps', id] });

  const deployMut = useMutation({
    mutationFn: () => appsApi.deploy(id!),
    onSuccess: () => { invalidate(); toast.success('Deployment started'); },
    onError: () => toast.error('Deployment failed to start'),
  });

  const startMut = useMutation({
    mutationFn: () => appsApi.start(id!),
    onSuccess: () => { invalidate(); toast.success('Started'); },
    onError: () => toast.error('Start failed'),
  });

  const stopMut = useMutation({
    mutationFn: () => appsApi.stop(id!),
    onSuccess: () => { invalidate(); toast.success('Stopped'); },
    onError: () => toast.error('Stop failed'),
  });

  const restartMut = useMutation({
    mutationFn: () => appsApi.restart(id!),
    onSuccess: () => { invalidate(); toast.success('Restarted'); },
    onError: () => toast.error('Restart failed'),
  });

  if (isLoading || !app) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    );
  }

  const hostname =
    app.subdomain && app.domain ? `${app.subdomain}.${app.domain}` : null;
  const accessUrl = status?.accessUrl;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'environment', label: 'Environment' },
    { id: 'logs', label: 'Logs' },
    { id: 'deployments', label: 'Deployments' },
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
            <button
              className="btn-ghost py-2"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
            >
              <Play className="w-4 h-4 text-emerald-400" /> Start
            </button>
          ) : (
            <button
              className="btn-ghost py-2"
              onClick={() => stopMut.mutate()}
              disabled={app.status !== 'running' || stopMut.isPending}
            >
              <Square className="w-4 h-4 text-yellow-400" /> Stop
            </button>
          )}
          <button
            className="btn-ghost py-2"
            onClick={() => restartMut.mutate()}
            disabled={app.status !== 'running' || restartMut.isPending}
          >
            <RotateCcw className="w-4 h-4" /> Restart
          </button>
          <button
            className={confirmDel ? 'btn-danger' : 'btn-ghost py-2'}
            onClick={handleDelete}
            disabled={deleteMut.isPending}
          >
            <Trash2 className="w-4 h-4" />
            {confirmDel ? 'Confirm?' : ''}
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
          <p className="text-xs text-slate-500 mb-1">Created</p>
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
                {sp.nodePort && (
                  <a
                    href={`http://192.168.188.10:${sp.nodePort}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 p-1 rounded hover:bg-surface-200 text-slate-400 hover:text-accent"
                    title={`Ouvrir sur NodePort ${sp.nodePort}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700/50 mb-6">
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Pods */}
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

          {/* Compose content preview */}
          {app.type === 'compose' && app.composeContent && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/40">
                <h3 className="text-sm font-semibold text-white">docker-compose.yml</h3>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto">{app.composeContent}</pre>
            </div>
          )}

          {/* No pods message */}
          {(!status?.pods || status.pods.length === 0) && app.type !== 'compose' && (
            <div className="card p-6 text-center text-slate-500 text-sm">
              Aucun pod en cours — déployez l'application pour la démarrer.
            </div>
          )}
        </div>
      )}

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
        </div>
      )}

      {tab === 'logs' && (
        <div className="card overflow-hidden h-[500px]">
          <LogsViewer appId={app.id} />
        </div>
      )}

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
