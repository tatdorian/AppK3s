import { useQuery } from '@tanstack/react-query';
import { nodesApi } from '../lib/api.js';
import { Loader2, CheckCircle2, XCircle, Cpu, MemoryStick, Container } from 'lucide-react';
import type { NodeInfo } from '@appk3s/shared';

// Convert Ki/Mi/Gi/m (CPU millicores) to human-readable
function parseCpu(val: string): { used: number; unit: string } {
  if (!val) return { used: 0, unit: 'm' };
  if (val.endsWith('n')) return { used: Math.round(parseInt(val) / 1_000_000), unit: 'm' };
  if (val.endsWith('u')) return { used: Math.round(parseInt(val) / 1_000), unit: 'm' };
  if (val.endsWith('m')) return { used: parseInt(val), unit: 'm' };
  return { used: parseInt(val) * 1000, unit: 'm' };
}

function parseMemory(val: string): { used: number; unit: string } {
  if (!val) return { used: 0, unit: 'Mi' };
  if (val.endsWith('Ki')) return { used: Math.round(parseInt(val) / 1024), unit: 'Mi' };
  if (val.endsWith('Mi')) return { used: parseInt(val), unit: 'Mi' };
  if (val.endsWith('Gi')) return { used: Math.round(parseInt(val) * 1024), unit: 'Mi' };
  if (val.endsWith('k')) return { used: Math.round(parseInt(val) / 1024), unit: 'Mi' };
  return { used: Math.round(parseInt(val) / (1024 * 1024)), unit: 'Mi' };
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color =
    pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-300 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NodeCard({ node }: { node: NodeInfo }) {
  const cpuAlloc = parseCpu(node.cpuAllocatable);
  const memAlloc = parseMemory(node.memoryAllocatable);

  const cpuUsed = node.cpuUsage ? parseCpu(node.cpuUsage) : null;
  const memUsed = node.memoryUsage ? parseMemory(node.memoryUsage) : null;

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white text-base">{node.name}</h3>
            {node.ready ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{node.internalIP}</p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {node.roles.map((r) => (
            <span
              key={r}
              className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-accent/15 text-accent"
            >
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* Metrics */}
      {cpuUsed && memUsed ? (
        <div className="space-y-2.5">
          <UsageBar
            label={`CPU — ${cpuUsed.used}m / ${cpuAlloc.used}m`}
            used={cpuUsed.used}
            total={cpuAlloc.used}
          />
          <UsageBar
            label={`Memory — ${memUsed.used} Mi / ${memAlloc.used} Mi`}
            used={memUsed.used}
            total={memAlloc.used}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-200 rounded-lg p-3 space-y-1">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Cpu className="w-3 h-3" /> CPU allocatable
            </p>
            <p className="text-sm font-semibold text-white">{cpuAlloc.used} cores</p>
          </div>
          <div className="bg-surface-200 rounded-lg p-3 space-y-1">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <MemoryStick className="w-3 h-3" /> RAM allocatable
            </p>
            <p className="text-sm font-semibold text-white">
              {Math.round(memAlloc.used / 1024)} Gi
            </p>
          </div>
        </div>
      )}

      {/* Pods */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Container className="w-3 h-3" />
        <span>Pods max : {node.podsAllocatable}</span>
      </div>

      {/* Info */}
      <div className="border-t border-slate-700/40 pt-3 grid grid-cols-2 gap-y-1.5 text-xs">
        <span className="text-slate-500">OS</span>
        <span className="text-slate-300 truncate">{node.osImage}</span>
        <span className="text-slate-500">Kernel</span>
        <span className="text-slate-300 font-mono">{node.kernelVersion}</span>
        <span className="text-slate-500">Runtime</span>
        <span className="text-slate-300 font-mono truncate">{node.containerRuntime}</span>
        <span className="text-slate-500">k8s</span>
        <span className="text-slate-300 font-mono">{node.k8sVersion}</span>
        <span className="text-slate-500">Âge</span>
        <span className="text-slate-300">{node.age}</span>
      </div>
    </div>
  );
}

export function NodesPage() {
  const { data: nodes, isLoading, error, refetch } = useQuery({
    queryKey: ['nodes'],
    queryFn: nodesApi.list,
    refetchInterval: 15_000, // refresh every 15s
  });

  const ready = nodes?.filter((n) => n.ready).length ?? 0;
  const total = nodes?.length ?? 0;
  const hasMetrics = nodes?.some((n) => n.cpuUsage !== null) ?? false;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Nœuds du cluster</h1>
          <p className="text-slate-400 text-sm mt-1">
            {total > 0 ? `${ready}/${total} nœuds prêts` : 'Chargement…'}
            {hasMetrics && (
              <span className="ml-2 text-emerald-400 text-xs">• métriques live</span>
            )}
            {!hasMetrics && total > 0 && (
              <span className="ml-2 text-slate-600 text-xs">• metrics-server non configuré</span>
            )}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost text-sm">
          Rafraîchir
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500 py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Connexion au cluster…
        </div>
      )}

      {error && (
        <div className="card p-6 border-red-500/30 bg-red-500/5 text-red-400 text-sm">
          Impossible de contacter le cluster k8s :{' '}
          {(error as any)?.response?.data?.message ?? (error as Error).message}
        </div>
      )}

      {nodes && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {nodes.map((node) => (
            <NodeCard key={node.name} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}
