import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import { Plus, FolderOpen, Boxes, ChevronRight, Trash2, Edit2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Project } from '@appk3s/shared';

const ROLE_BADGE: Record<string, string> = {
  owner:  'bg-accent/15 text-accent',
  member: 'bg-emerald-500/15 text-emerald-400',
  viewer: 'bg-slate-700 text-slate-400',
};
const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire', member: 'Membre', viewer: 'Lecteur',
};

export function ProjectsPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super-admin';

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  // Create project
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const createMut = useMutation({
    mutationFn: () => projectsApi.create({ name: newName, description: newDesc }),
    onSuccess: () => {
      toast.success('Projet créé');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });

  // Rename project inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      projectsApi.update(id, { name }),
    onSuccess: () => {
      toast.success('Renommé');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditId(null);
    },
    onError: () => toast.error('Erreur de renommage'),
  });

  // Delete
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      toast.success('Projet supprimé');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setConfirmDel(null);
    },
    onError: () => toast.error('Erreur de suppression'),
  });

  const handleDelete = (p: Project) => {
    if (confirmDel !== p.id) {
      setConfirmDel(p.id);
      setTimeout(() => setConfirmDel(null), 3000);
      return;
    }
    deleteMut.mutate(p.id);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Projets</h1>
          <p className="text-slate-400 text-sm mt-1">
            Groupez vos applications et gérez les accès par projet
          </p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Nouveau projet
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-white">Nouveau projet</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nom *</label>
              <input
                className="input"
                placeholder="Mon projet"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                placeholder="Optionnel"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}>
              Annuler
            </button>
            <button
              className="btn-primary"
              onClick={() => createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
            >
              {createMut.isPending ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      {isLoading ? (
        <div className="text-center text-slate-500 py-16">Chargement...</div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center space-y-3">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-slate-400">Aucun projet</p>
          {isAdmin && (
            <button className="btn-primary mx-auto" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Créer un projet
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="card p-5 flex items-center gap-4 hover:border-slate-600/60 transition-colors">
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <FolderOpen className="w-5 h-5 text-accent" />
              </div>

              {/* Name & description */}
              <div className="flex-1 min-w-0">
                {editId === p.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="input py-1 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameMut.mutate({ id: p.id, name: editName });
                        if (e.key === 'Escape') setEditId(null);
                      }}
                      autoFocus
                    />
                    <button className="text-accent hover:text-accent/80" onClick={() => renameMut.mutate({ id: p.id, name: editName })}>
                      <Check className="w-4 h-4" />
                    </button>
                    <button className="text-slate-500 hover:text-slate-300" onClick={() => setEditId(null)}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white truncate">{p.name}</p>
                    {/* Role badge for non-admins */}
                    {!isAdmin && p.myRole && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[p.myRole] ?? ''}`}>
                        {ROLE_LABEL[p.myRole] ?? p.myRole}
                      </span>
                    )}
                  </div>
                )}
                {p.description && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{p.description}</p>
                )}
              </div>

              {/* App count */}
              <div className="flex items-center gap-1.5 text-slate-400 text-sm shrink-0">
                <Boxes className="w-4 h-4" />
                <span>{p.appCount ?? 0} app{(p.appCount ?? 0) !== 1 ? 's' : ''}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && (
                  <>
                    <button
                      className="btn-ghost p-2 text-slate-500"
                      title="Renommer"
                      onClick={() => { setEditId(p.id); setEditName(p.name); }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {p.id !== '00000000-0000-0000-0000-000000000001' && (
                      <button
                        className={`btn-danger py-1.5 px-3 text-xs ${confirmDel === p.id ? 'animate-pulse' : ''}`}
                        onClick={() => handleDelete(p)}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {confirmDel === p.id ? 'Confirmer ?' : ''}
                      </button>
                    )}
                  </>
                )}
                <Link
                  to={`/projects/${p.id}`}
                  className="btn-ghost p-2 text-slate-400 hover:text-white"
                  title="Ouvrir"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
