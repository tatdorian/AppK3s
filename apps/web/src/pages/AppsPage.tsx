import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Loader2 } from 'lucide-react';
import { useApps, useDeleteApp } from '../hooks/useApps.js';
import { AppCard } from '../components/AppCard.js';

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
          {filtered.map((app) => (
            <div key={app.id} className="relative">
              {confirmDelete === app.id && (
                <div className="absolute inset-0 z-10 rounded-xl bg-red-900/80 backdrop-blur-sm flex items-center justify-center gap-3">
                  <span className="text-sm text-red-200">Cliquez à nouveau pour confirmer</span>
                </div>
              )}
              <AppCard app={app} onDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
