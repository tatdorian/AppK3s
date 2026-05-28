import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Loader2, FolderOpen } from 'lucide-react';
import { useApps } from '../hooks/useApps.js';
import { AppCard } from '../components/AppCard.js';
import { useProjectStore } from '../store/project.js';
import { useAuthStore } from '../store/auth.js';

export function AppsPage() {
  const { data: apps = [], isLoading } = useApps();
  const { currentProjectId } = useProjectStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super-admin';

  const [search, setSearch] = useState('');

  // Filtre par projet sélectionné
  const projectApps = useMemo(() => {
    let list = apps;
    if (currentProjectId !== null) {
      list = list.filter((a) => a.projectId === currentProjectId);
    }
    return list;
  }, [apps, currentProjectId]);

  const filtered = projectApps.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.image ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  // Non-admin sans projet sélectionné
  const noProjectSelected = !isAdmin && currentProjectId === null;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-slate-400 text-sm mt-1">
            {currentProjectId !== null
              ? `${projectApps.length} app${projectApps.length !== 1 ? 's' : ''} dans ce projet`
              : `${apps.length} déploiement${apps.length !== 1 ? 's' : ''} au total`}
          </p>
        </div>
        {!noProjectSelected && (
          <Link
            to={currentProjectId ? `/apps/new?projectId=${currentProjectId}` : '/apps/new'}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Nouvelle application
          </Link>
        )}
      </div>

      {/* Empty state — no project selected for non-admin */}
      {noProjectSelected ? (
        <div className="card p-12 text-center space-y-3">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-slate-400 font-medium">Sélectionnez un projet</p>
          <p className="text-slate-600 text-sm">
            Utilisez le sélecteur en haut pour choisir un projet et voir ses applications.
          </p>
        </div>
      ) : (
        <>
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
                {search ? 'Aucune application ne correspond.' : 'Aucune application dans ce projet.'}
              </p>
              {!search && (
                <Link
                  to={currentProjectId ? `/apps/new?projectId=${currentProjectId}` : '/apps/new'}
                  className="btn-primary mt-4 inline-flex"
                >
                  <Plus className="w-4 h-4" /> Déployer la première app
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((app) => (
                <AppCard key={app.id} app={app} showDelete={isAdmin} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
