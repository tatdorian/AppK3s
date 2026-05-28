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
  Globe,
  Lock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Mail,
  SendHorizonal,
} from 'lucide-react';
import { useAuthStore } from '../store/auth.js';
import { settingsApi, usersApi } from '../lib/api.js';
import type { ClusterSettings, User } from '@appk3s/shared';
import toast from 'react-hot-toast';
import axios from 'axios';
import { PasswordStrength, isPasswordValid } from '../components/PasswordStrength.js';

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
  const [role, setRole] = useState<'viewer' | 'admin'>('viewer');
  const [emailSent, setEmailSent] = useState(false);

  const createMut = useMutation({
    mutationFn: () => usersApi.create({ email, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEmailSent(true);
      setTimeout(() => onClose(), 2500);
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

        {emailSent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Mail className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-medium">Invitation envoyée !</p>
              <p className="text-slate-400 text-sm mt-1">
                Un email a été envoyé à <strong className="text-white">{email}</strong> avec un lien pour définir son mot de passe.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>

            <div>
              <label className="label">Rôle</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'admin')}>
                <option value="viewer">Membre</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent/5 border border-accent/20">
              <Mail className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Un email sera envoyé avec un lien pour définir le mot de passe.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={onClose}>
                Annuler
              </button>
              <button
                className="btn-primary"
                disabled={!email || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                Créer et inviter
              </button>
            </div>
          </>
        )}
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

  const pwValid = isPasswordValid(newPassword);

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
          <PasswordStrength password={newPassword} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            disabled={!pwValid || (isSelf && !currentPassword) || changeMut.isPending}
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

// ── Wildcard & TLS section ────────────────────────────────────────────────────
function WildcardSection({
  settings,
  onSave,
  saving,
}: {
  settings: ClusterSettings | undefined;
  onSave: (data: Partial<ClusterSettings>) => void;
  saving: boolean;
}) {
  const [interfaceDomain, setInterfaceDomain] = useState('');
  const [masterNodeIp, setMasterNodeIp] = useState('');
  const [acmeEmail, setAcmeEmail] = useState('');

  useEffect(() => {
    if (!settings) return;
    setInterfaceDomain(settings.interfaceDomain ?? '');
    setMasterNodeIp(settings.masterNodeIp ?? '');
    setAcmeEmail(settings.acmeEmail ?? '');
  }, [settings]);

  const { data: certStatus, refetch: refetchCert, isFetching: certFetching } = useQuery({
    queryKey: ['cert-status'],
    queryFn: settingsApi.getCertStatus,
    refetchInterval: 15000,
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ interfaceDomain, masterNodeIp, acmeEmail });
  };

  return (
    <form onSubmit={handleSave}>
      <div className="card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">Domaine & TLS</h2>
        </div>
        <p className="text-xs text-slate-500 -mt-3">
          Configuration du domaine de l'interface AK3s et des certificats TLS.
          Le domaine wildcard se configure dans les <strong className="text-slate-400">paramètres de chaque projet</strong>.
        </p>

        {/* Interface domain */}
        <div>
          <label className="label flex items-center gap-1">
            <Lock className="w-3 h-3" /> Domaine interface AK3s
          </label>
          <input
            className="input"
            placeholder="ak3s.apps.example.com"
            value={interfaceDomain}
            onChange={(e) => setInterfaceDomain(e.target.value.trim())}
          />
        </div>

        {/* Master node IP */}
        <div>
          <label className="label flex items-center gap-1">
            <Globe className="w-3 h-3" /> IP du nœud master (routage interne CoreDNS)
          </label>
          <input
            className="input font-mono"
            placeholder="192.168.188.10"
            value={masterNodeIp}
            onChange={(e) => setMasterNodeIp(e.target.value.trim())}
          />
          <p className="text-xs text-slate-500 mt-1">
            Tous les sous-domaines résoudront vers cette IP au sein du cluster —
            nécessaire pour la validation ACME HTTP-01.
          </p>
        </div>

        {/* ACME email */}
        <div>
          <label className="label">Email Let's Encrypt (ACME)</label>
          <input
            className="input"
            type="email"
            placeholder="admin@example.com"
            value={acmeEmail}
            onChange={(e) => setAcmeEmail(e.target.value.trim())}
          />
        </div>

        {/* Cert status */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-100 border border-slate-700/40">
          {certFetching ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : certStatus?.ready ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
          <span className="text-xs text-slate-300 flex-1">
            {certStatus?.ready
              ? 'Certificat TLS actif'
              : certStatus?.message || 'Certificat en attente ou non configuré'}
          </span>
          <button
            type="button"
            onClick={() => refetchCert()}
            className="text-slate-500 hover:text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Application…</>
            ) : (
              <><Save className="w-4 h-4" /> Appliquer</>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── SMTP section ──────────────────────────────────────────────────────────────
function SmtpSection({
  settings,
  onSave,
  saving,
}: {
  settings: ClusterSettings | undefined;
  onSave: (data: Partial<ClusterSettings>) => void;
  saving: boolean;
}) {
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSmtpHost(settings.smtpHost ?? '');
    setSmtpPort(settings.smtpPort ?? '587');
    setSmtpUser(settings.smtpUser ?? '');
    setSmtpPass(settings.smtpPass ?? '');
    setSmtpFrom(settings.smtpFrom ?? '');
    setSmtpSecure(settings.smtpSecure === 'true');
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
      smtpSecure: String(smtpSecure),
    });
  };

  const handleTest = async () => {
    if (!testEmail) return;
    setTestLoading(true);
    try {
      await axios.post('/api/notifications/channels/test-smtp', { email: testEmail }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success('Test email sent!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to send test email');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">SMTP Configuration</h2>
        </div>
        <p className="text-xs text-slate-500 -mt-2">
          Configure SMTP to send email notifications for deployments and alerts.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">SMTP Host</label>
            <input
              className="input"
              placeholder="smtp.example.com"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value.trim())}
            />
          </div>
          <div>
            <label className="label">Port</label>
            <input
              className="input"
              type="number"
              placeholder="587"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              placeholder="user@example.com"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value.trim())}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <PasswordInput value={smtpPass} onChange={setSmtpPass} autoComplete="new-password" />
          </div>
        </div>

        <div>
          <label className="label">From address</label>
          <input
            className="input"
            placeholder="AK3s <noreply@example.com>"
            value={smtpFrom}
            onChange={(e) => setSmtpFrom(e.target.value.trim())}
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="smtpSecure"
            checked={smtpSecure}
            onChange={(e) => setSmtpSecure(e.target.checked)}
            className="w-4 h-4 rounded accent-accent"
          />
          <label htmlFor="smtpSecure" className="text-sm text-slate-300">
            Use TLS (port 465)
          </label>
        </div>

        {smtpHost && (
          <div className="flex items-center gap-2 pt-1">
            <input
              className="input flex-1"
              type="email"
              placeholder="Send test email to…"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost shrink-0"
              disabled={!testEmail || testLoading}
              onClick={handleTest}
            >
              {testLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SendHorizonal className="w-4 h-4" />
              )}
              Test
            </button>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4" /> Save SMTP</>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── OAuth section (GitHub / GitLab) ──────────────────────────────────────────
function OAuthSection({
  settings,
  onSave,
  saving,
}: {
  settings: ClusterSettings | undefined;
  onSave: (data: Partial<ClusterSettings>) => void;
  saving: boolean;
}) {
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [gitlabClientId, setGitlabClientId] = useState('');
  const [gitlabClientSecret, setGitlabClientSecret] = useState('');
  const [gitlabBaseUrl, setGitlabBaseUrl] = useState('https://gitlab.com');

  useEffect(() => {
    if (!settings) return;
    setGithubClientId((settings as any).githubClientId ?? '');
    setGithubClientSecret((settings as any).githubClientSecret ?? '');
    setGitlabClientId((settings as any).gitlabClientId ?? '');
    setGitlabClientSecret((settings as any).gitlabClientSecret ?? '');
    setGitlabBaseUrl((settings as any).gitlabBaseUrl ?? 'https://gitlab.com');
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      githubClientId,
      githubClientSecret,
      gitlabClientId,
      gitlabClientSecret,
      gitlabBaseUrl,
    } as any);
  };

  return (
    <form onSubmit={handleSave}>
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">OAuth GitHub & GitLab</h2>
        </div>
        <p className="text-xs text-slate-500 -mt-2">
          Configurez les applications OAuth pour permettre aux utilisateurs de connecter leurs comptes GitHub/GitLab.
          Créez une <strong className="text-slate-400">OAuth App</strong> dans les paramètres développeur de GitHub/GitLab et entrez les credentials ici.
        </p>

        {/* GitHub */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">GitHub</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Client ID</label>
              <input
                className="input"
                placeholder="Ov23ct..."
                value={githubClientId}
                onChange={(e) => setGithubClientId(e.target.value.trim())}
              />
            </div>
            <div>
              <label className="label">Client Secret</label>
              <PasswordInput value={githubClientSecret} onChange={setGithubClientSecret} placeholder="••••••••••••••••••••" />
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Callback URL à enregistrer : <code className="text-slate-500">{window.location.origin}/api/git/github/callback</code>
          </p>
        </div>

        {/* GitLab */}
        <div className="space-y-3 pt-2 border-t border-slate-700/30">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">GitLab</p>
          <div>
            <label className="label">URL GitLab</label>
            <input
              className="input"
              placeholder="https://gitlab.com"
              value={gitlabBaseUrl}
              onChange={(e) => setGitlabBaseUrl(e.target.value.trim())}
            />
            <p className="text-xs text-slate-600 mt-1">Laissez la valeur par défaut pour GitLab.com</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Application ID</label>
              <input
                className="input"
                placeholder="1234567890abcdef..."
                value={gitlabClientId}
                onChange={(e) => setGitlabClientId(e.target.value.trim())}
              />
            </div>
            <div>
              <label className="label">Secret</label>
              <PasswordInput value={gitlabClientSecret} onChange={setGitlabClientSecret} placeholder="gloas-••••••••••••" />
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Callback URL à enregistrer : <code className="text-slate-500">{window.location.origin}/api/git/gitlab/callback</code>
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary text-sm" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Sauvegarde…</> : <><Save className="w-4 h-4" /> Sauvegarder OAuth</>}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin' || user?.role === 'super-admin';

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: isAdmin,
  });

  const [defaultIngressClass, setDefaultIngressClass] = useState('traefik');
  const [defaultTls, setDefaultTls] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDefaultIngressClass(settings.defaultIngressClass ?? 'traefik');
    setDefaultTls(settings.defaultTls === 'true');
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (data: Partial<ClusterSettings>) => settingsApi.update(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['cert-status'] });
      if ('warning' in (result as object)) {
        toast.error(`Sauvegardé avec avertissement : ${(result as { warning: string }).warning}`);
      } else {
        toast.success('Paramètres sauvegardés');
      }
    },
    onError: () => toast.error('Échec de la sauvegarde'),
  });

  const handleDefaultsSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMut.mutate({
      defaultIngressClass,
      defaultTls: String(defaultTls),
    });
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Paramètres</h1>
        <p className="text-slate-400 text-sm mt-1">Configuration du cluster et des domaines</p>
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

      {/* Domaine interface & TLS */}
      <WildcardSection
        settings={settings}
        onSave={(data) => saveMut.mutate(data)}
        saving={saveMut.isPending}
      />

      {/* Global deployment defaults */}
      <form onSubmit={handleDefaultsSave}>
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
              Activer TLS par défaut (nécessite le cert wildcard)
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

      {/* SMTP configuration */}
      <SmtpSection
        settings={settings}
        onSave={(data) => saveMut.mutate(data)}
        saving={saveMut.isPending}
      />

      {/* GitHub / GitLab OAuth */}
      <OAuthSection
        settings={settings}
        onSave={(data) => saveMut.mutate(data)}
        saving={saveMut.isPending}
      />

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
          AK3s se connecte à votre cluster k3s via le service account in-cluster lors
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
