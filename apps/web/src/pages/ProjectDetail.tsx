import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, usersApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import {
  ChevronLeft, FolderOpen, Users, Boxes, Plus,
  Trash2, Shield, UserCog, Eye, UserPlus, Mail,
  Globe, Save, Loader2,
} from 'lucide-react';
import { AppCard } from '../components/AppCard.js';
import toast from 'react-hot-toast';

type Tab = 'apps' | 'team' | 'settings';
type AddMode = 'existing' | 'create';

// ─── Labels de rôle projet ────────────────────────────────────────────────────
const PROJECT_ROLE_META = {
  owner:  { label: '🔑 Admin Projet',   desc: 'Accès complet + gestion équipe + modifier les URLs', icon: Shield },
  member: { label: '👤 Utilisateur',     desc: 'Créer & supprimer des apps, pas de changement URL', icon: UserCog },
  viewer: { label: '👁️ Lecture seule',  desc: 'Lecture uniquement, aucune action', icon: Eye },
};

type ProjectRole = keyof typeof PROJECT_ROLE_META;

function RoleBadge({ role }: { role: string }) {
  const meta = PROJECT_ROLE_META[role as ProjectRole];
  if (!meta) return <span className="text-xs text-slate-500">{role}</span>;
  const colorClass =
    role === 'owner'  ? 'bg-accent/15 text-accent' :
    role === 'member' ? 'bg-emerald-500/15 text-emerald-400' :
                        'bg-slate-700 text-slate-400';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
      {meta.label}
    </span>
  );
}

function RoleSelect({
  value,
  onChange,
  canAssignOwner = false,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  canAssignOwner?: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      className="input py-1 text-xs w-44"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {canAssignOwner && <option value="owner">🔑 Admin Projet</option>}
      <option value="member">👤 Utilisateur</option>
      <option value="viewer">👁️ Lecture seule</option>
    </select>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super-admin';

  const [tab, setTab] = useState<Tab>('apps');
  const [addMode, setAddMode] = useState<AddMode>('existing');

  // Projet
  const { data: project, isLoading } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  // Mon rôle dans ce projet
  const { data: myRoleData } = useQuery({
    queryKey: ['projects', id, 'my-role'],
    queryFn: () => projectsApi.getMyRole(id!),
    enabled: !!id && !isAdmin,
  });
  const myProjectRole: ProjectRole | undefined = isAdmin ? 'owner' : (myRoleData?.role as ProjectRole | undefined);
  const canManageTeam = isAdmin || myProjectRole === 'owner';

  // Membres du projet
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ['projects', id, 'members'],
    queryFn: () => projectsApi.getMembers(id!),
    enabled: !!id && canManageTeam,
  });

  // Tous les users (pour l'invite existant)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: canManageTeam && isAdmin, // non-admin project owners fetch via members list
  });

  const currentMembers = (members as any[]).filter((m: any) => m.projectRole !== null);
  const notYetMembers = (allUsers as any[]).filter(
    (u: any) => u.role !== 'admin' && !currentMembers.some((m: any) => m.userId === u.id),
  );

  // ── Inviter un utilisateur existant ──────────────────────────────────────
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');

  const inviteMut = useMutation({
    mutationFn: () => projectsApi.inviteMember(id!, { userId: inviteUserId, role: inviteRole }),
    onSuccess: () => {
      toast.success('Membre ajouté au projet');
      setInviteUserId('');
      refetchMembers();
      qc.invalidateQueries({ queryKey: ['projects', id, 'members'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });

  // ── Créer un nouveau compte ───────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<ProjectRole>('member');
  const [createEmailSent, setCreateEmailSent] = useState(false);

  const createUserMut = useMutation({
    mutationFn: () =>
      projectsApi.createUser(id!, { email: newEmail, projectRole: newRole }),
    onSuccess: (data: any) => {
      setCreateEmailSent(true);
      refetchMembers();
      qc.invalidateQueries({ queryKey: ['projects', id, 'members'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setTimeout(() => {
        setNewEmail('');
        setNewRole('member');
        setCreateEmailSent(false);
      }, 3000);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur de création'),
  });

  // ── Changer le rôle d'un membre ───────────────────────────────────────────
  const updateRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      projectsApi.updateMemberRole(id!, userId, role),
    onSuccess: () => {
      toast.success('Rôle mis à jour');
      refetchMembers();
    },
    onError: () => toast.error('Erreur'),
  });

  // ── Retirer un membre ─────────────────────────────────────────────────────
  const removeMut = useMutation({
    mutationFn: (userId: string) => projectsApi.removeMember(id!, userId),
    onSuccess: () => {
      toast.success('Membre retiré du projet');
      refetchMembers();
    },
    onError: () => toast.error('Erreur'),
  });

  // ── Paramètres du projet (wildcard domain) ────────────────────────────────
  const [wildcardDomain, setWildcardDomain] = useState('');
  useEffect(() => {
    if (project) setWildcardDomain((project as any).wildcardDomain ?? '');
  }, [project]);

  const updateProjectMut = useMutation({
    mutationFn: () => projectsApi.update(id!, { wildcardDomain: wildcardDomain || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Paramètres du projet sauvegardés');
    },
    onError: () => toast.error('Erreur de sauvegarde'),
  });

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Chargement...
      </div>
    );
  }

  const apps = (project as any).apps ?? [];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/projects" className="btn-ghost p-2">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <FolderOpen className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          {project.description && (
            <p className="text-slate-400 text-sm">{project.description}</p>
          )}
        </div>
        {(isAdmin || myProjectRole === 'owner' || myProjectRole === 'member') && (
          <Link
            to={`/apps/new?projectId=${id}`}
            className="btn-primary ml-auto"
          >
            <Plus className="w-4 h-4" /> Nouvelle app
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <Boxes className="w-5 h-5 text-accent" />
          <div>
            <p className="text-2xl font-bold text-white">{apps.length}</p>
            <p className="text-xs text-slate-500">Applications</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <Users className="w-5 h-5 text-accent" />
          <div>
            <p className="text-2xl font-bold text-white">{currentMembers.length}</p>
            <p className="text-xs text-slate-500">Membres</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          {myProjectRole === 'owner' || isAdmin ? (
            <Shield className="w-5 h-5 text-accent" />
          ) : myProjectRole === 'member' ? (
            <UserCog className="w-5 h-5 text-slate-400" />
          ) : (
            <Eye className="w-5 h-5 text-slate-400" />
          )}
          <div>
            <p className="text-sm font-semibold text-white">
              {isAdmin
                ? 'Admin Général'
                : myProjectRole
                  ? PROJECT_ROLE_META[myProjectRole]?.label
                  : '—'}
            </p>
            <p className="text-xs text-slate-500">Votre rôle</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700/40">
        {([
          { id: 'apps' as Tab, label: 'Applications', icon: Boxes },
          ...(canManageTeam ? [{ id: 'team' as Tab, label: 'Équipe', icon: Users }] : []),
          ...(canManageTeam ? [{ id: 'settings' as Tab, label: 'Paramètres', icon: Globe }] : []),
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tabId
                ? 'text-accent border-accent'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Apps tab ────────────────────────────────────────────────────────── */}
      {tab === 'apps' && (
        <div>
          {apps.length === 0 ? (
            <div className="card p-12 text-center space-y-3">
              <Boxes className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-400">Aucune application dans ce projet</p>
              {(isAdmin || myProjectRole === 'owner' || myProjectRole === 'member') && (
                <Link to={`/apps/new?projectId=${id}`} className="btn-primary inline-flex mx-auto">
                  <Plus className="w-4 h-4" /> Créer une app
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {apps.map((app: any) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Team tab ────────────────────────────────────────────────────────── */}
      {tab === 'team' && canManageTeam && (
        <div className="space-y-6">

          {/* ── Ajouter un membre ── */}
          <div className="card p-5 space-y-4">
            {/* Mode switcher */}
            <div className="flex items-center gap-1 bg-surface-200/50 rounded-lg p-1 w-fit">
              <button
                onClick={() => setAddMode('existing')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  addMode === 'existing'
                    ? 'bg-accent text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> Utilisateur existant
              </button>
              <button
                onClick={() => setAddMode('create')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  addMode === 'create'
                    ? 'bg-accent text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" /> Créer un compte
              </button>
            </div>

            {/* Mode: inviter un utilisateur existant */}
            {addMode === 'existing' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Ajouter un compte déjà existant dans le système.
                </p>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="label">Utilisateur</label>
                    {isAdmin ? (
                      <select
                        className="input"
                        value={inviteUserId}
                        onChange={(e) => setInviteUserId(e.target.value)}
                      >
                        <option value="">Sélectionner un utilisateur...</option>
                        {notYetMembers.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.email}</option>
                        ))}
                      </select>
                    ) : (
                      // Non-admin project owners: show members who are NOT yet in this project
                      <select
                        className="input"
                        value={inviteUserId}
                        onChange={(e) => setInviteUserId(e.target.value)}
                      >
                        <option value="">Sélectionner un utilisateur...</option>
                        {(members as any[])
                          .filter((m: any) => m.projectRole === null)
                          .map((m: any) => (
                            <option key={m.userId} value={m.userId}>{m.email}</option>
                          ))}
                      </select>
                    )}
                  </div>
                  <div className="w-48">
                    <label className="label">Rôle</label>
                    <RoleSelect
                      value={inviteRole}
                      onChange={(v) => setInviteRole(v as ProjectRole)}
                      canAssignOwner={isAdmin}
                    />
                  </div>
                  <button
                    className="btn-primary py-2"
                    onClick={() => inviteMut.mutate()}
                    disabled={!inviteUserId || inviteMut.isPending}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Inviter
                  </button>
                </div>
              </div>
            )}

            {/* Mode: créer un nouveau compte */}
            {addMode === 'create' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Crée un nouveau compte utilisateur et l'ajoute directement à ce projet.
                  {!isAdmin && (
                    <span className="block mt-0.5 text-slate-600">
                      En tant qu'Admin Projet, vous ne pouvez pas nommer un autre Admin Projet.
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
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
                    <label className="label">Rôle dans le projet</label>
                    <RoleSelect
                      value={newRole}
                      onChange={(v) => setNewRole(v as ProjectRole)}
                      canAssignOwner={isAdmin}
                    />
                  </div>
                </div>
                {createEmailSent ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <Mail className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-sm text-emerald-300">
                      Email envoyé à <strong>{newEmail}</strong> avec un lien pour définir son mot de passe.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent/5 border border-accent/20">
                      <Mail className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Un email sera envoyé avec un lien pour définir le mot de passe. Aucun mot de passe temporaire n'est nécessaire.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        className="btn-primary"
                        onClick={() => createUserMut.mutate()}
                        disabled={!newEmail || createUserMut.isPending}
                      >
                        <UserPlus className="w-4 h-4" />
                        {createUserMut.isPending ? 'Envoi...' : 'Créer et inviter'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Liste des membres ── */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Membres du projet ({currentMembers.length})
              </h4>
            </div>
            {currentMembers.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                Aucun membre. Utilisez le formulaire ci-dessus pour en ajouter.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-surface-200/20">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Utilisateur</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Rôle projet</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMembers.map((m: any) => (
                    <tr key={m.userId} className="border-b border-slate-700/20 last:border-0 hover:bg-surface-200/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
                            {(m.email as string)[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white">{m.email}</p>
                            <p className="text-xs text-slate-600">{m.globalRole}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleSelect
                          value={m.projectRole}
                          onChange={(role) => updateRoleMut.mutate({ userId: m.userId, role })}
                          canAssignOwner={isAdmin}
                          disabled={updateRoleMut.isPending}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="btn-danger py-1 px-3 text-xs"
                          onClick={() => removeMut.mutate(m.userId)}
                          disabled={removeMut.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Retirer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Légende des rôles ── */}
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(PROJECT_ROLE_META) as [ProjectRole, typeof PROJECT_ROLE_META[ProjectRole]][]).map(
              ([role, info]) => {
                const colorClass =
                  role === 'owner'  ? 'border-accent/30' :
                  role === 'member' ? 'border-emerald-500/30' :
                                      'border-slate-700/40';
                return (
                  <div key={role} className={`card p-3 space-y-1 border ${colorClass}`}>
                    <p className="font-semibold text-white text-xs">{info.label}</p>
                    <p className="text-xs text-slate-500">{info.desc}</p>
                  </div>
                );
              }
            )}
          </div>

          <p className="text-xs text-slate-600">
            Les Admins Généraux ont toujours accès complet à tous les projets sans être listés ici.
          </p>
        </div>
      )}

      {/* ── Settings tab ──────────────────────────────────────────────────────── */}
      {tab === 'settings' && canManageTeam && (
        <div className="space-y-5">
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-white">Domaine wildcard du projet</h2>
            </div>
            <p className="text-xs text-slate-500">
              Définissez un domaine spécifique à ce projet. Les apps créées dans ce projet
              proposeront ce domaine par défaut au lieu du domaine global.
              Laissez vide pour utiliser le domaine global.
            </p>
            <div>
              <label className="label flex items-center gap-1">
                <Globe className="w-3 h-3" /> Wildcard domain (ex : <code className="text-xs text-accent">prod.example.com</code>)
              </label>
              <input
                className="input"
                placeholder="prod.example.com"
                value={wildcardDomain}
                onChange={(e) => setWildcardDomain(e.target.value.trim())}
              />
              {wildcardDomain && (
                <p className="text-xs text-accent mt-1">
                  Les apps de ce projet seront sous : *.{wildcardDomain}
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                className="btn-primary"
                onClick={() => updateProjectMut.mutate()}
                disabled={updateProjectMut.isPending}
              >
                {updateProjectMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sauvegarde…</>
                ) : (
                  <><Save className="w-4 h-4" /> Sauvegarder</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
