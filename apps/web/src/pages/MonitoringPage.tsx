import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Plus,
  Trash2,
  Loader2,
  Bell,
  ToggleLeft,
  ToggleRight,
  Cpu,
  MemoryStick,
  RefreshCw,
  Pencil,
  X,
} from 'lucide-react';
import { monitoringApi, appsApi } from '../lib/api.js';
import type { AlertRule } from '@appk3s/shared';
import { relativeTime } from '../lib/utils.js';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Kubernetes metrics-server reports CPU usage in nanocores ("154321134n"),
// while allocatable uses millicores ("2000m") or whole cores ("2").
function parseCpuMillicores(cpu: string): number {
  if (!cpu) return 0;
  if (cpu.endsWith('n')) return parseInt(cpu.slice(0, -1), 10) / 1_000_000; // nanocores → millicores
  if (cpu.endsWith('m')) return parseInt(cpu.slice(0, -1), 10);             // millicores
  return parseFloat(cpu) * 1000;                                             // whole cores
}

function parseMemoryBytes(mem: string): number {
  if (!mem) return 0;
  if (mem.endsWith('Ki')) return parseInt(mem.slice(0, -2), 10) * 1024;
  if (mem.endsWith('Mi')) return parseInt(mem.slice(0, -2), 10) * 1024 * 1024;
  if (mem.endsWith('Gi')) return parseInt(mem.slice(0, -2), 10) * 1024 * 1024 * 1024;
  return parseInt(mem, 10);
}

function formatCpu(millicores: number): string {
  if (millicores >= 1000) return `${(millicores / 1000).toFixed(millicores % 1000 === 0 ? 0 : 1)} cores`;
  return `${millicores}m`;
}

function formatMemory(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ─── Node Metric Card ─────────────────────────────────────────────────────────
function NodeMetricBar({
  label,
  usageRaw,
  allocatableRaw,
  icon: Icon,
}: {
  label: string;
  usageRaw: string | null;
  allocatableRaw: string;
  icon: React.ElementType;
}) {
  const isMemory = label === 'RAM';
  const allocNum = isMemory ? parseMemoryBytes(allocatableRaw) : parseCpuMillicores(allocatableRaw);
  const usageNum = usageRaw
    ? (isMemory ? parseMemoryBytes(usageRaw) : parseCpuMillicores(usageRaw))
    : null;

  const percent = allocNum > 0 && usageNum !== null
    ? Math.round((usageNum / allocNum) * 100)
    : null;

  const allocStr = isMemory ? formatMemory(allocNum) : formatCpu(allocNum);
  const usageStr = usageNum !== null
    ? (isMemory ? formatMemory(usageNum) : formatCpu(usageNum))
    : null;

  const barColor =
    percent === null ? 'bg-slate-600'
    : percent > 80 ? 'bg-red-400'
    : percent > 60 ? 'bg-amber-400'
    : 'bg-green-400';

  const textColor =
    percent === null ? 'text-slate-400'
    : percent > 80 ? 'text-red-400'
    : percent > 60 ? 'text-amber-400'
    : 'text-green-400';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {usageStr && (
            <span className={`font-semibold ${textColor}`}>{usageStr}</span>
          )}
          {usageStr && <span className="text-slate-600">/</span>}
          <span className="text-slate-400">{allocStr}</span>
          {percent !== null && (
            <span className={`font-bold ml-1 ${textColor}`}>{percent}%</span>
          )}
        </div>
      </div>
      <div className="w-full bg-surface-300 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: percent !== null ? `${Math.min(percent, 100)}%` : '0%' }}
        />
      </div>
      {percent === null && (
        <p className="text-xs text-slate-600 italic">
          Métriques live indisponibles (metrics-server non installé)
        </p>
      )}
    </div>
  );
}

// ─── Alert Form (shared by Create + Edit) ────────────────────────────────────
function AlertForm({
  title,
  initial,
  onSubmit,
  onClose,
  isPending,
}: {
  title: string;
  initial: {
    name: string;
    metric: 'cpu_percent' | 'memory_percent' | 'pod_restarts';
    operator: 'gt' | 'lt';
    threshold: string;
    durationMinutes: string;
    appId: string;
  };
  onSubmit: (v: typeof initial) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [metric, setMetric] = useState(initial.metric);
  const [operator, setOperator] = useState<'gt' | 'lt'>(initial.operator);
  const [threshold, setThreshold] = useState(initial.threshold);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [appId, setAppId] = useState(initial.appId);

  const { data: apps = [] } = useQuery({
    queryKey: ['apps'],
    queryFn: appsApi.list,
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" /> {title}
          </h2>
          <button className="btn-ghost p-1" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="label">Nom de la règle</label>
          <input
            className="input"
            placeholder="CPU élevé"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Métrique</label>
            <select
              className="input"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
            >
              <option value="cpu_percent">CPU %</option>
              <option value="memory_percent">Mémoire %</option>
              <option value="pod_restarts">Redémarrages pod</option>
            </select>
          </div>

          <div>
            <label className="label">Opérateur</label>
            <select
              className="input"
              value={operator}
              onChange={(e) => setOperator(e.target.value as 'gt' | 'lt')}
            >
              <option value="gt">supérieur à (&gt;)</option>
              <option value="lt">inférieur à (&lt;)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Seuil</label>
            <input
              className="input"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              min="0"
              step="1"
            />
          </div>

          <div>
            <label className="label">Durée (min)</label>
            <input
              className="input"
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              min="1"
            />
          </div>
        </div>

        <div>
          <label className="label">
            Application <span className="text-slate-500 font-normal">(optionnel — vide = cluster entier)</span>
          </label>
          <select
            className="input"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          >
            <option value="">Cluster entier</option>
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim() || !threshold || isPending}
            onClick={() => onSubmit({ name, metric, operator, threshold, durationMinutes, appId })}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({ rule }: { rule: AlertRule }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const toggleMut = useMutation({
    mutationFn: () =>
      monitoringApi.updateAlert(rule.id, { enabled: !rule.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    onError: () => toast.error('Échec de la mise à jour'),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<AlertRule>) => monitoringApi.updateAlert(rule.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Règle mise à jour');
      setEditing(false);
    },
    onError: () => toast.error('Échec de la mise à jour'),
  });

  const deleteMut = useMutation({
    mutationFn: () => monitoringApi.deleteAlert(rule.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Règle supprimée');
    },
    onError: () => toast.error('Échec de la suppression'),
  });

  const metricLabel: Record<string, string> = {
    cpu_percent: 'CPU %',
    memory_percent: 'Mémoire %',
    pod_restarts: 'Redémarrages pod',
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-700/40 last:border-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => toggleMut.mutate()}
            disabled={toggleMut.isPending}
            className="text-slate-400 hover:text-accent transition-colors shrink-0"
            title={rule.enabled ? 'Désactiver' : 'Activer'}
          >
            {rule.enabled ? (
              <ToggleRight className="w-5 h-5 text-green-400" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
          </button>
          <div className="min-w-0">
            <p className="text-sm text-white">{rule.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {metricLabel[rule.metric] ?? rule.metric}{' '}
              {rule.operator === 'gt' ? '>' : '<'}{' '}
              <span className="text-slate-300">{rule.threshold}</span>
              {' pendant '}{rule.durationMinutes} min
              {rule.lastTriggeredAt && (
                <span className="ml-2 text-amber-500">
                  · Déclenché: {relativeTime(rule.lastTriggeredAt)}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            className="btn-ghost p-1.5 text-slate-400 hover:text-accent"
            onClick={() => setEditing(true)}
            title="Modifier"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-ghost p-1.5 text-slate-400 hover:text-red-400"
            onClick={() => {
              if (confirm(`Supprimer la règle "${rule.name}" ?`)) deleteMut.mutate();
            }}
            disabled={deleteMut.isPending}
          >
            {deleteMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {editing && (
        <AlertForm
          title="Modifier la règle"
          initial={{
            name: rule.name,
            metric: rule.metric as 'cpu_percent' | 'memory_percent' | 'pod_restarts',
            operator: rule.operator as 'gt' | 'lt',
            threshold: String(rule.threshold),
            durationMinutes: String(rule.durationMinutes),
            appId: rule.appId ?? '',
          }}
          onSubmit={(v) =>
            updateMut.mutate({
              name: v.name,
              metric: v.metric,
              operator: v.operator,
              threshold: parseFloat(v.threshold),
              durationMinutes: parseInt(v.durationMinutes, 10),
              appId: v.appId || undefined,
            })
          }
          onClose={() => setEditing(false)}
          isPending={updateMut.isPending}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function MonitoringPage() {
  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const qc = useQueryClient();

  const {
    data: nodes = [],
    isLoading: nodesLoading,
    refetch: refetchNodes,
    isFetching: nodesFetching,
  } = useQuery({
    queryKey: ['monitoring-nodes'],
    queryFn: monitoringApi.getNodeMetrics,
    refetchInterval: 30_000,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: monitoringApi.listAlerts,
  });

  const createAlertMut = useMutation({
    mutationFn: (v: {
      name: string;
      metric: 'cpu_percent' | 'memory_percent' | 'pod_restarts';
      operator: 'gt' | 'lt';
      threshold: string;
      durationMinutes: string;
      appId: string;
    }) =>
      monitoringApi.createAlert({
        name: v.name,
        metric: v.metric,
        operator: v.operator,
        threshold: parseFloat(v.threshold),
        durationMinutes: parseInt(v.durationMinutes, 10),
        ...(v.appId ? { appId: v.appId } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Règle d\'alerte créée');
      setShowCreateAlert(false);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Erreur de création'),
  });

  const hasMetricsServer = nodes.some((n) => n.cpuUsage !== null);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Monitoring</h1>
        <p className="text-slate-400 text-sm mt-1">
          Métriques des nœuds et règles d'alerte
        </p>
      </div>

      {/* Node metrics */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" /> Nœuds du cluster
          </h2>
          <button
            className="btn-ghost text-xs py-1"
            onClick={() => refetchNodes()}
            disabled={nodesFetching}
          >
            {nodesFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Actualiser
          </button>
        </div>

        {!hasMetricsServer && nodes.length > 0 && (
          <div className="card p-3 flex items-center gap-2 text-xs text-amber-400 border-amber-500/20 bg-amber-500/5">
            <Activity className="w-3.5 h-3.5 shrink-0" />
            metrics-server non installé — seules les ressources allouables sont affichées (pas de métriques live)
          </div>
        )}

        {nodesLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="card p-4 text-center text-slate-500 text-sm">
            Aucun nœud trouvé
          </div>
        ) : (
          nodes.map((node) => (
            <div key={node.name} className="card p-4">
              {/* Node header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      node.ready ? 'bg-green-400' : 'bg-red-400'
                    }`}
                  />
                  <span className="text-sm font-semibold text-white">{node.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-surface-300 text-slate-400">
                    {node.roles.join(', ')}
                  </span>
                  {node.internalIP && (
                    <span className="text-xs text-slate-600 font-mono">{node.internalIP}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{node.k8sVersion}</span>
                  <span>Pods: {node.podsAllocatable}</span>
                  <span>Uptime: {node.age}</span>
                </div>
              </div>

              {/* Resource bars */}
              <div className="space-y-3">
                <NodeMetricBar
                  label="CPU"
                  usageRaw={node.cpuUsage}
                  allocatableRaw={node.cpuAllocatable}
                  icon={Cpu}
                />
                <NodeMetricBar
                  label="RAM"
                  usageRaw={node.memoryUsage}
                  allocatableRaw={node.memoryAllocatable}
                  icon={MemoryStick}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Alert rules */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" /> Règles d'alerte
          </h2>
          <button
            className="btn-primary text-xs py-1.5"
            onClick={() => setShowCreateAlert(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Créer une alerte
          </button>
        </div>

        {alertsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-6 text-slate-500">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune règle d'alerte configurée.</p>
            <button
              className="btn-primary mt-3 text-sm"
              onClick={() => setShowCreateAlert(true)}
            >
              <Plus className="w-4 h-4" /> Créer la première alerte
            </button>
          </div>
        ) : (
          <div>
            {alerts.map((rule) => (
              <AlertRow key={rule.id} rule={rule} />
            ))}
          </div>
        )}
      </div>

      {showCreateAlert && (
        <AlertForm
          title="Créer une règle d'alerte"
          initial={{
            name: '',
            metric: 'cpu_percent',
            operator: 'gt',
            threshold: '80',
            durationMinutes: '5',
            appId: '',
          }}
          onSubmit={(v) => createAlertMut.mutate(v)}
          onClose={() => setShowCreateAlert(false)}
          isPending={createAlertMut.isPending}
        />
      )}
    </div>
  );
}
