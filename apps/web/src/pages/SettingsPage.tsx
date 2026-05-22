import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Loader2,
  UserPlus,
  Trash2,
  Shield,
  User as UserIcon,
  Eye,
  EyeOff,
  ChevronDown,
  KeyRound,
} from 'lucide-react';
import { useAuthStore } from '../store/auth.js';
import { settingsApi, usersApi } from '../lib/api.js';
import type { ClusterSettings, User } from '@appk3s/shared';
import toast from 'react-hot-toast';

// ─── Password input with show/hide toggle ───────────────────────────────────
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className="input pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ─── Create User Modal ───────────────────────────────────────────────────────
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'viewer' | 'admin'>('viewer');

  const createMut = useMutation({
    mutationFn: () => usersApi.create({ email, password, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur créé');
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Échec de la création'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-accent" /> Créer un utilisateur
        </h2>

        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="label">Mot de passe</label>
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        </div>

        <div>
          <label className="label">Rôle</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'admin')}>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            disabled={!email || !password || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Password Modal ───────────────────────────────────────────────────
function ChangePasswordModal({
  user,
  isSelf,
  onClose,
}: {
  user: User;
  isSelf: boolean;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const changeMut = useMutation({
    mutationFn: () =>
      usersApi.update(user.id, {
        password: newPassword,
        ...(isSelf ? { currentPassword } : {}),
      }),
    onSuccess: () => {
      toast.success('Mot de passe modifié');
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Échec'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent" /> Changer le mot de passe
        </h2>
        <p className="text-sm text-slate-400">{user.email}</p>

        {isSelf && (
          <div>
            <label className="label">Mot de passe actuel</label>
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
          </div>
        )}

        <div>
          <label className="label">Nouveau mot de passe</label>
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            disabled={!newPassword || (isSelf && !currentPassword) || changeMut.isPending}
            onClick={() => changeMut.mutate()}
          >
            {changeMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            Changer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({
  user,
  isSelf,
  isAdmin,
}: {
  user: User;
  isSelf: boolean;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [showChangePwd, setShowChangePwd] = useState(false);

  const deleteMut = useMutation({
    mutationFn: () => usersApi.delete(user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur supprimé');
    },
    onError: () => toast.error('Suppression impossible'),
  });

  const roleToggleMut = useMutation({
    mutationFn: () =>
      usersApi.update(user.id, { role: user.role === 'admin' ? 'viewer' : 'admin' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Rôle mis à jour');
    },
    onError: () => toast.error('Mise à jour impossible'),
  });

  const canChangeRole = isAdmin && !isSelf;
  const canDelete = isAdmin && !isSelf;

  return (
    <>
      <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-700/40 last:border-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-surface-300 flex items-center justify-center shrink-0">
            {user.role === 'admin' ? (
              <Shield className="w-3.5 h-3.5 text-accent" />
            ) : (
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white truncate">
              {user.email}
              {isSelf && (
                <span className="ml-2 text-xs text-slate-500">(vous)</span>
              )}
            </p>
            <button
              onClick={() => canChangeRole && roleToggleMut.mutate()}
              disabled={!canChangeRole || roleToggleMut.isPending}
              className={`flex items-center gap-1 text-xs mt-0.5 transition-colors ${
                canChangeRole
                  ? 'text-slate-400 hover:text-accent cursor-pointer'
                  : 'text-slate-500 cursor-default'
              }`}
              title={canChangeRole ? 'Changer le rôle' : undefined}
            >
              {user.role}
              {canChangeRole && <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="btn-ghost p-1.5 text-slate-400 hover:text-slate-200"
            title="Changer le mot de passe"
            onClick={() => setShowChangePwd(true)}
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
          {canDelete && (
            <button
              className="btn-ghost p-1.5 text-slate-400 hover:text-red-400"
              title="Supprimer"
              onClick={() => {
                if (confirm(`Supprimer ${user.email} ?`)) deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {showChangePwd && (
        <ChangePasswordModal
          user={user}
          isSelf={isSelf}
          onClose={() => setShowChangePwd(false)}
        />
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: isAdmin,
  });

  const [defaultDomain, setDefaultDomain] = useState('');
  const [defaultIngressClass, setDefaultIngressClass] = useState('traefik');
  const [defaultTls, setDefaultTls] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDefaultDomain(settings.defaultDomain ?? '');
    setDefaultIngressClass(settings.defaultIngressClass ?? 'traefik');
    setDefaultTls(settings.defaultTls === 'true');
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (data: Partial<ClusterSettings>) => settingsApi.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Paramètres sauvegardés');
    },
    onError: () => toast.error('Échec de la sauvegarde'),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMut.mutate({
      defaultDomain,
      defaultIngressClass,
      defaultTls: String(defaultTls),
    });
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Paramètres</h1>
        <p className="text-slate-400 text-sm mt-1">Configuration du compte et du cluster</p>
      </div>

      {/* Account */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Compte</h2>
        <div>
          <label className="label">Email</label>
          <input className="input" value={user?.email ?? ''} disabled />
        </div>
        <div>
          <label className="label">Rôle</label>
          <input className="input" value={user?.role ?? ''} disabled />
        </div>
      </div>

      {/* Global deployment defaults */}
      <form onSubmit={handleSave}>
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Déploiement — Valeurs par défaut</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ces valeurs pré-remplissent le formulaire de création d'application.
              </p>
            </div>
            {settingsLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
          </div>

          {/* Wildcard domain */}
          <div>
            <label className="label">Domaine wildcard *</label>
            <input
              className="input"
              placeholder="w0.app.syit.fr"
              value={defaultDomain}
              onChange={(e) => setDefaultDomain(e.target.value.trim())}
            />
            <p className="text-xs text-slate-600 mt-1">
              Sera utilisé comme domaine par défaut pour tous les déploiements.
              {defaultDomain && (
                <span className="text-accent ml-1">
                  Exemple : mon-app.{defaultDomain}
                </span>
              )}
            </p>
          </div>

          {/* Ingress class */}
          <div>
            <label className="label">Ingress class par défaut</label>
            <select
              className="input"
              value={defaultIngressClass}
              onChange={(e) => setDefaultIngressClass(e.target.value)}
            >
              <option value="traefik">Traefik (k3s défaut)</option>
              <option value="nginx">nginx</option>
            </select>
          </div>

          {/* TLS */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="defaultTls"
              checked={defaultTls}
              onChange={(e) => setDefaultTls(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            <label htmlFor="defaultTls" className="text-sm text-slate-300">
              Activer TLS par défaut
            </label>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="btn-primary"
              disabled={saveMut.isPending || settingsLoading}
            >
              {saveMut.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sauvegarde…</>
              ) : (
                <><Save className="w-4 h-4" /> Sauvegarder</>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* User management (admin only) */}
      {isAdmin && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Gestion des utilisateurs</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Créez des comptes et gérez les accès au cluster.
              </p>
            </div>
            <button
              className="btn-primary text-xs py-1.5"
              onClick={() => setShowCreateUser(true)}
            >
              <UserPlus className="w-3.5 h-3.5" /> Créer
            </button>
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : !users?.length ? (
            <p className="text-sm text-slate-500 text-center py-2">Aucun utilisateur</p>
          ) : (
            <div>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === user?.id}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cluster info */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Cluster k8s</h2>
        <p className="text-sm text-slate-400">
          AppK3s se connecte à votre cluster k3s via le service account in-cluster lors
          d'un déploiement dans le cluster, ou via{' '}
          <code className="text-accent">~/.kube/config</code> en développement local.
        </p>
        <p className="text-sm text-slate-500">
          Définissez <code className="text-slate-300">KUBECONFIG</code> pour utiliser un
          kubeconfig personnalisé.
        </p>
      </div>

      {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} />}
    </div>
  );
}
