import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Loader2, Globe, ExternalLink, Server } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { useApps, useDeleteApp } from '../hooks/useApps.js';
import { AppCard } from '../components/AppCard.js';
import { appsApi } from '../lib/api.js';
import type { AppStatusInfo } from '@appk3s/shared';

// Charge le status de chaque app (lazy, en parallèle)
function useAllStatuses(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['apps', id, 'status'],
      queryFn: () => appsApi.status(id),
      refetchInterval: 10000,
      // Ne bloque pas le rendu de la liste si une requête échoue
      retry: false,
      staleTime: 8000,
    })),
  });
}

export function AppsPage() {
  const { data: apps = [], isLoading } = useApps();
  const deleteMut = useDeleteApp();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = apps.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.image ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  // Fetch status pour toutes les apps en parallèle
  const statusResults = useAllStatuses(apps.map((a) => a.id));
  const statusMap: Record<string, AppStatusInfo> = {};
  apps.forEach((app, i) => {
    const data = statusResults[i]?.data;
    if (data) statusMap[app.id] = data;
  });

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      deleteMut.mutate(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-slate-400 text-sm mt-1">{apps.length} déploiements sur k3s</p>
        </div>
        <Link to="/apps/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          Nouvelle application
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          className="input pl-9"
          placeholder="Rechercher une application..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement des applications...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500">
            {search ? 'Aucune application ne correspond.' : 'Aucune application.'}
          </p>
          {!search && (
            <Link to="/apps/new" className="btn-primary mt-4 inline-flex">
              <Plus className="w-4 h-4" /> Déployer la première app
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((app) => {
            const status = statusMap[app.id];
            const hostname = app.subdomain && app.domain
              ? `${app.subdomain}.${app.domain}` : null;
            const firstNodePort = status?.servicePorts?.find((p) => p.nodePort)?.nodePort;
            const nodePortUrls = status?.nodePortUrls ?? [];

            return (
              <div key={app.id} className="relative flex flex-col gap-0">
                {confirmDelete === app.id && (
                  <div className="absolute inset-0 z-10 rounded-xl bg-red-900/80 backdrop-blur-sm flex items-center justify-center gap-3">
                    <span className="text-sm text-red-200">Cliquez à nouveau pour confirmer</span>
                  </div>
                )}
                <AppCard app={app} onDelete={handleDelete} />

                {/* Access URLs sous la card — affichées seulement si le status est chargé */}
                {(hostname || firstNodePort) && (
                  <div className="card -mt-px rounded-t-none border-t border-slate-700/60 px-4 py-2.5 flex flex-col gap-1">
                    {/* Hostname via Ingress */}
                    {hostname && (
                      <a
                        href={`http${app.tlsEnabled ? 's' : ''}://${hostname}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
                      >
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{hostname}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0 ml-auto" />
                      </a>
                    )}
                    {/* NodePort URLs */}
                    {firstNodePort && nodePortUrls.length > 0 && (
                      <div className="flex items-start gap-1.5">
                        <Server className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs text-slate-500">
                            NodePort <span className="text-slate-300 font-mono">{firstNodePort}</span>
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {nodePortUrls.map((url) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-mono text-slate-400 hover:text-accent transition-colors"
                              >
                                {url.replace('http://', '')}
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
