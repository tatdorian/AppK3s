import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import { Plus, Trash2, Shield, UserCog, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import type { User } from '@appk3s/shared';

export function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuthStore();

  // List of users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  // Create user form state
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer');
  const [showPw, setShowPw] = useState(false);

  const createMut = useMutation({
    mutationFn: () => usersApi.create({ email: newEmail, password: newPassword, role: newRole }),
    onSuccess: () => {
      toast.success('Utilisateur créé');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setNewEmail(''); setNewPassword(''); setNewRole('viewer');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur de création'),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      usersApi.update(id, { role }),
    onSuccess: () => {
      toast.success('Rôle mis à jour');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('Erreur de mise à jour'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success('Utilisateur supprimé');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('Erreur de suppression'),
  });

  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const handleDelete = (u: User) => {
    if (confirmDel !== u.id) {
      setConfirmDel(u.id);
      setTimeout(() => setConfirmDel(null), 3000);
      return;
    }
    deleteMut.mutate(u.id);
    setConfirmDel(null);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
          <p className="text-slate-400 text-sm mt-1">Gérez les comptes et leurs droits d'accès</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus className="w-4 h-4" />
          Nouvel utilisateur
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-white">Créer un utilisateur</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="label">Email *</label>
              <input
                className="input"
                type="email"
                placeholder="user@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Rôle</label>
              <select
                className="input"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')}
              >
                <option value="viewer">Membre</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Mot de passe *</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPw ? 'text' : 'password'}
                placeholder="Mot de passe temporaire"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => { setShowCreate(false); setNewEmail(''); setNewPassword(''); }}>
              Annuler
            </button>
            <button
              className="btn-primary"
              onClick={() => createMut.mutate()}
              disabled={!newEmail || !newPassword || createMut.isPending}
            >
              {createMut.isPending ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-slate-500 text-sm text-center">Chargement...</p>
        ) : users.length === 0 ? (
          <p className="p-6 text-slate-500 text-sm text-center">Aucun utilisateur.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/40">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Rôle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Créé le</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-b border-slate-700/20 last:border-0 hover:bg-surface-200/30">
                    {/* Email + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
                          {u.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-medium">{u.email}</p>
                          {isSelf && <p className="text-xs text-accent">Vous</p>}
                        </div>
                      </div>
                    </td>
                    {/* Role selector */}
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/15 text-accent">
                          <Shield className="w-3 h-3" /> {u.role}
                        </span>
                      ) : (
                        <select
                          className="input py-1 text-xs w-28"
                          value={u.role}
                          onChange={(e) => roleMut.mutate({ id: u.id, role: e.target.value })}
                          disabled={roleMut.isPending}
                        >
                          <option value="viewer">Membre</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </td>
                    {/* Created at */}
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <button
                          className={`btn-danger py-1.5 px-3 text-xs ${confirmDel === u.id ? 'animate-pulse' : ''}`}
                          onClick={() => handleDelete(u)}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {confirmDel === u.id ? 'Confirmer ?' : 'Supprimer'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Roles explanation */}
      <div className="mt-6 card p-4 space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Rôles</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">Admin</p>
              <p className="text-xs text-slate-500">Accès complet à toutes les apps et aux paramètres. Peut gérer les utilisateurs.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UserCog className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">Membre</p>
              <p className="text-xs text-slate-500">Accès limité uniquement aux apps sur lesquelles un rôle a été attribué.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
