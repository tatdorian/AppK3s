import { useApps } from '../hooks/useApps.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { relativeTime } from '../lib/utils.js';
import { Link } from 'react-router-dom';
import { Boxes, CheckCircle2, XCircle, PauseCircle, Loader2 } from 'lucide-react';

export function Dashboard() {
  const { data: apps = [], isLoading } = useApps();

  const stats = {
    total: apps.length,
    running: apps.filter((a) => a.status === 'running').length,
    stopped: apps.filter((a) => a.status === 'stopped').length,
    error: apps.filter((a) => a.status === 'error').length,
    deploying: apps.filter((a) => a.status === 'deploying').length,
  };

  const cards = [
    { label: 'Total', value: stats.total, icon: Boxes, color: 'text-accent' },
    { label: 'Running', value: stats.running, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Stopped', value: stats.stopped, icon: PauseCircle, color: 'text-slate-400' },
    { label: 'Errors', value: stats.error, icon: XCircle, color: 'text-red-400' },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Overview of your k3s deployments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent apps */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Recent Applications
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : apps.length === 0 ? (
          <div className="card p-8 text-center">
            <Boxes className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No applications yet.</p>
            <Link to="/apps/new" className="btn-primary mt-4 inline-flex">
              Deploy your first app
            </Link>
          </div>
        ) : (
          <div className="card divide-y divide-slate-700/40">
            {apps.slice(0, 8).map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-200/50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <Link
                    to={`/apps/${app.id}`}
                    className="font-medium text-white hover:text-accent transition-colors truncate"
                  >
                    {app.name}
                  </Link>
                  <span className="text-xs text-slate-600 truncate hidden sm:block">
                    {app.namespace}
                  </span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-slate-600 hidden md:block">
                    {relativeTime(app.updatedAt)}
                  </span>
                  <StatusBadge status={app.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
