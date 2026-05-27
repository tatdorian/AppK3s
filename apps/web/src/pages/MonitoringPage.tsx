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
} from 'lucide-react';
import { monitoringApi, appsApi } from '../lib/api.js';
import type { AlertRule } from '@appk3s/shared';
import { relativeTime } from '../lib/utils.js';
import toast from 'react-hot-toast';

// ─── Node Metric Card ─────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  percent,
  icon: Icon,
}: {
  label: string;
  value: string;
  percent: number | null;
  icon: React.ElementType;
}) {
  const color =
    percent === null
      ? 'text-slate-400'
      : percent > 80
      ? 'text-red-400'
      : percent > 60
      ? 'text-amber-400'
      : 'text-green-400';

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>
        {percent !== null ? `${percent}%` : 'N/A'}
      </div>
      <div className="text-xs text-slate-500">{value}</div>
      {percent !== null && (
        <div className="w-full bg-surface-300 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              percent > 80 ? 'bg-red-400' : percent > 60 ? 'bg-amber-400' : 'bg-green-400'
            }`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Create Alert Modal ───────────────────────────────────────────────────────
function CreateAlertModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [metric, setMetric] = useState<'cpu_percent' | 'memory_percent' | 'pod_restarts'>('cpu_percent');
  const [operator, setOperator] = useState<'gt' | 'lt'>('gt');
  const [threshold, setThreshold] = useState('80');
  const [durationMinutes, setDurationMinutes] = useState('5');
  const [appId, setAppId] = useState('');

  const { data: apps = [] } = useQuery({
    queryKey: ['apps'],
    queryFn: appsApi.list,
  });

  const createMut = useMutation({
    mutationFn: () =>
      monitoringApi.createAlert({
        name,
        metric,
        operator,
        threshold: parseFloat(threshold),
        durationMinutes: parseInt(durationMinutes, 10),
        ...(appId ? { appId } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert rule created');
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Failed to create alert rule'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" /> Create alert rule
        </h2>

        <div>
          <label className="label">Rule name</label>
          <input
            className="input"
            placeholder="High CPU usage"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Metric</label>
            <select
              className="input"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
            >
              <option value="cpu_percent">CPU %</option>
              <option value="memory_percent">Memory %</option>
              <option value="pod_restarts">Pod restarts</option>
            </select>
          </div>

          <div>
            <label className="label">Operator</label>
            <select
              className="input"
              value={operator}
              onChange={(e) => setOperator(e.target.value as 'gt' | 'lt')}
            >
              <option value="gt">greater than (&gt;)</option>
              <option value="lt">less than (&lt;)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Threshold</label>
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
            <label className="label">Duration (min)</label>
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
            Application <span className="text-slate-500 font-normal">(optional — leave empty for cluster-wide)</span>
          </label>
          <select
            className="input"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          >
            <option value="">Cluster-wide</option>
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim() || !threshold || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({ rule }: { rule: AlertRule }) {
  const qc = useQueryClient();

  const toggleMut = useMutation({
    mutationFn: () =>
      monitoringApi.updateAlert(rule.id, { enabled: !rule.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    onError: () => toast.error('Failed to update alert rule'),
  });

  const deleteMut = useMutation({
    mutationFn: () => monitoringApi.deleteAlert(rule.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert rule deleted');
    },
    onError: () => toast.error('Failed to delete alert rule'),
  });

  const metricLabel: Record<string, string> = {
    cpu_percent: 'CPU %',
    memory_percent: 'Memory %',
    pod_restarts: 'Pod restarts',
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-700/40 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => toggleMut.mutate()}
          disabled={toggleMut.isPending}
          className="text-slate-400 hover:text-accent transition-colors shrink-0"
          title={rule.enabled ? 'Disable' : 'Enable'}
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
            {' for '}{rule.durationMinutes}min
            {rule.lastTriggeredAt && (
              <span className="ml-2 text-amber-500">
                Last triggered: {relativeTime(rule.lastTriggeredAt)}
              </span>
            )}
          </p>
        </div>
      </div>

      <button
        className="btn-ghost p-1.5 text-slate-400 hover:text-red-400 shrink-0"
        onClick={() => {
          if (confirm(`Delete alert "${rule.name}"?`)) deleteMut.mutate();
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function MonitoringPage() {
  const [showCreateAlert, setShowCreateAlert] = useState(false);

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

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Monitoring</h1>
        <p className="text-slate-400 text-sm mt-1">
          Node metrics and alert rules
        </p>
      </div>

      {/* Node metrics */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" /> Node Metrics
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
            Refresh
          </button>
        </div>

        {nodesLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="card p-4 text-center text-slate-500 text-sm">
            No nodes found
          </div>
        ) : (
          nodes.map((node) => (
            <div key={node.name} className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    node.ready ? 'bg-green-400' : 'bg-red-400'
                  }`}
                />
                <span className="text-sm font-medium text-white">{node.name}</span>
                <span className="text-xs text-slate-500">
                  {node.roles.join(', ')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="CPU"
                  value={node.cpuUsage ?? 'N/A'}
                  percent={node.cpuPercent}
                  icon={Cpu}
                />
                <MetricCard
                  label="Memory"
                  value={node.memoryUsage ?? 'N/A'}
                  percent={node.memoryPercent}
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
            <Bell className="w-4 h-4 text-accent" /> Alert Rules
          </h2>
          <button
            className="btn-primary text-xs py-1.5"
            onClick={() => setShowCreateAlert(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Create alert
          </button>
        </div>

        {alertsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-6 text-slate-500">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No alert rules configured.</p>
            <button
              className="btn-primary mt-3 text-sm"
              onClick={() => setShowCreateAlert(true)}
            >
              <Plus className="w-4 h-4" /> Create your first alert
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
        <CreateAlertModal onClose={() => setShowCreateAlert(false)} />
      )}
    </div>
  );
}
