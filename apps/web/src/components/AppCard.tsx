import { Link } from 'react-router-dom';
import { Play, Square, RotateCcw, Trash2, Globe, Container, ExternalLink } from 'lucide-react';
import type { Application } from '@appk3s/shared';
import { StatusBadge } from './StatusBadge.js';
import { relativeTime } from '../lib/utils.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appsApi } from '../lib/api.js';
import toast from 'react-hot-toast';

interface Props {
  app: Application;
  onDelete?: (id: string) => void;
}

export function AppCard({ app, onDelete }: Props) {
  const qc = useQueryClient();

  const onSuccess = (label: string) => () => {
    qc.invalidateQueries({ queryKey: ['apps'] });
    toast.success(label);
  };
  const onError = (label: string) => () => toast.error(`${label} failed`);

  const startMut = useMutation({
    mutationFn: () => appsApi.start(app.id),
    onSuccess: onSuccess('Started'),
    onError: onError('Start'),
  });

  const stopMut = useMutation({
    mutationFn: () => appsApi.stop(app.id),
    onSuccess: onSuccess('Stopped'),
    onError: onError('Stop'),
  });

  const restartMut = useMutation({
    mutationFn: () => appsApi.restart(app.id),
    onSuccess: onSuccess('Restarted'),
    onError: onError('Restart'),
  });

  const deployMut = useMutation({
    mutationFn: () => appsApi.deploy(app.id),
    onSuccess: onSuccess('Deployment started'),
    onError: onError('Deploy'),
  });

  const hostname =
    app.subdomain && app.domain ? `${app.subdomain}.${app.domain}` : null;

  return (
    <div className="card p-5 flex flex-col gap-4 hover:border-slate-600/70 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-surface-300 flex items-center justify-center shrink-0">
            <Container className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <Link
              to={`/apps/${app.id}`}
              className="font-semibold text-white hover:text-accent transition-colors truncate block"
            >
              {app.name}
            </Link>
            <p className="text-xs text-slate-500 truncate">
              {app.type === 'docker-image'
                ? `${app.image}:${app.imageTag}`
                : 'docker-compose'}
            </p>
          </div>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {/* Access URL via Ingress hostname */}
      {hostname && (
        <a
          href={`http${app.tlsEnabled ? 's' : ''}://${hostname}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          <Globe className="w-3 h-3" />
          <span className="truncate">{hostname}</span>
          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
        </a>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/40">
        <span className="text-xs text-slate-600">{relativeTime(app.updatedAt)}</span>

        <div className="flex items-center gap-1">
          <button
            className="btn-ghost p-1.5"
            title="Re-deploy"
            onClick={() => deployMut.mutate()}
            disabled={app.status === 'deploying' || deployMut.isPending}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {app.status === 'stopped' ? (
            <button
              className="btn-ghost p-1.5"
              title="Start"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          ) : (
            <button
              className="btn-ghost p-1.5"
              title="Stop"
              onClick={() => stopMut.mutate()}
              disabled={app.status !== 'running' || stopMut.isPending}
            >
              <Square className="w-3.5 h-3.5 text-yellow-400" />
            </button>
          )}
          {onDelete && (
            <button
              className="btn-ghost p-1.5"
              title="Delete"
              onClick={() => onDelete(app.id)}
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
