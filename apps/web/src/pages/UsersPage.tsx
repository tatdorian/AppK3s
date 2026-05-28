import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, projectsApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import {
  Plus, Trash2, Shield, UserCog, Mail, ChevronDown, ChevronUp,
  FolderOpen, CheckSquare, Square, X, Crown, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { User } from '@appk3s/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const GLOBAL_ROLES = [
  { value: 'super-admin', label: 'Super Admin', desc: 'Accès total + gestion utilisateurs', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  { value: 'admin',       label: 'Admin',       desc: 'Accès complet à tous les projets',  color: 'text-accent bg-accent/10 border-accent/30' },
  { value: 'member',      label: 'Membre',      desc: 'Accès aux projets assignés',        color: 'text-slate-300 bg-slate-700/50 border-slate-600' },
] as const;

const PROJECT_ROLES = [
  { value: 'owner',  label: 'Admin projet',  desc: 'Accès complet + gestion équipe' },
  { value: 'member', label: 'Membre',        desc: 'Créer & gérer des apps' },
  { value: 'viewer', label: 'Lecture seule', desc: 'Consultation uniquement' },
] as const;

function roleBadge(role: string) {
  const r = GLOBAL_ROLES.find((g) => g.value === role);
  return r ? r.color : 'text-slate-400 bg-slate-800 border-slate-700';
}

function roleLabel(role: string) {
  const r = GLOBAL_ROLES.find((g) => g.value === role);
  return r ? r.label : role;
}

// ─── ProjectRolesPanel ────────────────────────────────────────────────────────

function ProjectRolesPanel({ user, projects }: { user: User; projects: any[] }) {
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['user-project-memberships', user.id],
    queryFn: async () => {
      const results = await Promise.all(
        projects.map((p) =>
          projectsApi.getMembers(p.id).then((ms) => {
            const m = ms.find((m: any) => m.id === user.id);
            return m ? { projectId: p.id, projectName: p.name, role: m.projectRole ?? m.role } : null;
          }).catch(() => null),
        ),
      );
      return results.filter(Boolean) as { projectId: string; projectName: string; role: string }[];
    },
    enabled: projects.length > 0,
  });

  const [addingProject, setAddingProject] = useState<string | null>(null);
  const [addRole, setAddRole] = useState('member');

  const addMut = useMutation({
    mutationFn: ({ projectId, role }: { projectId: string; role: string }) =>
      projectsApi.inviteMember(projectId, { userId: user.id, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-project-memberships', user.id] });
      setAddingProject(null);
      toast.success('Rôle projet assigné');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });

  const updateMut = useMutation({
    mutationFn: ({ projectId, role }: { projectId: string; role: string }) =>
      projectsApi.updateMemberRole(projectId, user.id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-project-memberships', user.id] });
      toast.success('Rôle mis à jour');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });

  const removeMut = useMutation({
    mutationFn: (projectId: string) => projectsApi.removeMember(projectId, user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-project-memberships', user.id] });
      toast.success('Accès retiré');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });

  const assignedIds = new Set(members.map((m) => m.projectId));
  const availableProjects = projects.filter((p) => !assignedIds.has(p.id));

  if (isLoading) {
    return <p className="text-xs text-slate-500 py-2">Chargement des projets…</p>;
  }

  return (
    <div className="space-y-2">
      {/* Current memberships */}
      {members.length === 0 ? (
        <p className="text-xs text-slate-500 italic">Aucun projet assigné</p>
      ) : (
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.projectId} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
              <FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-300 flex-1 truncate">{m.projectName}</span>
              <select
                className="input py-0.5 text-xs w-32"
                value={m.role}
                onChange={(e) => updateMut.mutate({ projectId: m.projectId, role: e.target.value })}
                disabled={updateMut.isPending}
              >
                {PROJECT_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={() => removeMut.mutate(m.projectId)}
                disabled={removeMut.isPending}
                className="text-slate-600 hover:text-red-400 transition-colors p-0.5"
                title="Retirer l'accès"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add project */}
      {availableProjects.length > 0 && (
        addingProject === null ? (
          <button
            onClick={() => { setAddingProject(''); setAddRole('member'); }}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter un projet
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-slate-800/30 rounded-lg px-3 py-2">
            <select
              className="input py-0.5 text-xs flex-1"
              value={addingProject}
              onChange={(e) => setAddingProject(e.target.value)}
              autoFocus
            >
              <option value="">— Choisir un projet —</option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              className="input py-0.5 text-xs w-32"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
            >
              {PROJECT_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              className="btn-primary py-1 px-2 text-xs"
              disabled={!addingProject || addMut.isPending}
              onClick={() => addMut.mutate({ projectId: addingProject, role: addRole })}
            >
              Ajouter
            </button>
            <button
              className="btn-ghost py-1 px-2 text-xs"
              onClick={() => setAddingProject(null)}
            >
              Annuler
            </button>
          </div>
        )
      )}
    </div>
  );
}

// ─── UserRow ──────────────────────────────────────────────────────────────────

function UserRow({
  u,
  isSelf,
  isSuperAdmin,
  projects,
  onRoleChange,
  onDelete,
}: {
  u: User;
  isSelf: boolean;
  isSuperAdmin: boolean;
  projects: any[];
  onRoleChange: (id: string, role: string) => void;
  onDelete: (u: User) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const isGlobalAdmin = u.role === 'admin' || u.role === 'super-admin';

  const handleDelete = () => {
    if (!confirmDel) {
      setConfirmDel(true);
      setTimeout(() => setConfirmDel(false), 3000);
      return;
    }
    onDelete(u);
    setConfirmDel(false);
  };

  return (
    <>
      <tr className="border-b border-slate-700/20 last:border-0 hover:bg-surface-200/20 transition-colors">
        {/* User info */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
              {u.email[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium text-sm">{u.email}</p>
              {isSelf && <p className="text-xs text-accent">Vous</p>}
            </div>
          </div>
        </td>

        {/* Role */}
        <td className="px-4 py-3">
          {isSelf ? (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleBadge(u.role)}`}>
              {u.role === 'super-admin' && <Crown className="w-3 h-3" />}
              {u.role !== 'super-admin' && <Shield className="w-3 h-3" />}
              {roleLabel(u.role)}
            </span>
          ) : isSuperAdmin ? (
            <select
              className="input py-1 text-xs w-36"
              value={u.role}
              onChange={(e) => onRoleChange(u.id, e.target.value)}
            >
              {GLOBAL_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleBadge(u.role)}`}>
              {roleLabel(u.role)}
            </span>
          )}
        </td>

        {/* Created */}
        <td className="px-4 py-3 text-xs text-slate-400">
          {new Date(u.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </td>

        {/* Actions */}
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            {/* Project roles toggle — super-admins can assign projects to anyone */}
            {isSuperAdmin && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="btn-ghost py-1.5 px-2 text-xs flex items-center gap-1"
                title="Gérer les accès projets"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Projets
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
            {!isSelf && isSuperAdmin && (
              <button
                className={`btn-danger py-1.5 px-3 text-xs ${confirmDel ? 'animate-pulse' : ''}`}
                onClick={handleDelete}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDel ? 'Confirmer ?' : 'Supprimer'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded project roles panel */}
      {expanded && (
        <tr className="border-b border-slate-700/20 bg-slate-900/40">
          <td colSpan={4} className="px-8 py-3">
            <div className="flex items-start gap-3">
              <FolderOpen className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-400 mb-2">Accès par projet</p>
                <ProjectRolesPanel user={u} projects={projects} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuthStore();
  const isSuperAdmin = me?.role === 'super-admin';

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  // ── Create form ────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<string>('member');
  const [emailSent, setEmailSent] = useState(false);
  type AssignMode = 'none' | 'all' | 'select';
  const [assignMode, setAssignMode] = useState<AssignMode>('none');
  const [selectedProjects, setSelectedProjects] = useState<Record<string, string>>({});

  const toggleProject = (id: string) =>
    setSelectedProjects((prev) =>
      prev[id] ? (({ [id]: _, ...rest }) => rest)(prev) : { ...prev, [id]: 'member' },
    );

  // Project role is always derived from global role — never set per-project
  const derivedProjectRole = newRole === 'admin' ? 'owner' : 'member';

  const buildProjectsPayload = () => {
    // super-admin gets all projects automatically on the backend
    if (newRole === 'super-admin') return undefined;
    if (assignMode === 'all') return 'all' as const;
    if (assignMode === 'select')
      // Send projectId only — backend derives role from global role
      return Object.keys(selectedProjects).map((projectId) => ({ projectId, projectRole: derivedProjectRole }));
    return undefined;
  };

  const isProjectSelectionValid = () => {
    if (newRole === 'super-admin') return true; // no project needed
    if (assignMode === 'all') return true;
    if (assignMode === 'select') return Object.keys(selectedProjects).length > 0;
    return false; // 'none' is not allowed for admin/member
  };

  const resetForm = () => {
    setShowCreate(false); setEmailSent(false); setNewEmail('');
    setNewRole('member'); setAssignMode('select'); setSelectedProjects({});
  };

  const createMut = useMutation({
    mutationFn: () => usersApi.create({ email: newEmail, role: newRole as any, projects: buildProjectsPayload() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEmailSent(true); setTimeout(resetForm, 3500); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur de création'),
  });

  // ── Role / Delete ──────────────────────────────────────────────────────────
  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => usersApi.update(id, { role }),
    onSuccess: (_data, { role }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user-project-memberships'] });
      if (role === 'super-admin') {
        toast.success('Promu super-admin — accès à tous les projets accordé');
      } else if (role === 'admin') {
        toast.success('Rôle admin — tous les projets mis en admin projet');
      } else {
        toast.success('Rôle mis à jour');
      }
    },
    onError: () => toast.error('Erreur de mise à jour'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => { toast.success('Utilisateur supprimé'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: () => toast.error('Erreur de suppression'),
  });

  const isSuperAdminRole = newRole === 'super-admin';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
          <p className="text-slate-400 text-sm mt-1">Gérez les comptes et leurs droits d'accès</p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="w-4 h-4" /> Nouvel utilisateur
          </button>
        )}
      </div>

      {/* ── Create form ── */}
      {showCreate && (
        <div className="card p-5 mb-6 space-y-5">
          <h2 className="text-sm font-semibold text-white">Créer un utilisateur</h2>

          {emailSent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Mail className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-medium">Invitation envoyée !</p>
                <p className="text-slate-400 text-sm mt-1">
                  Un email a été envoyé à <strong className="text-white">{newEmail}</strong> avec un lien pour définir son mot de passe.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="label">Email *</label>
                  <input className="input" type="email" placeholder="user@example.com" value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="label">Rôle global</label>
                  <select className="input" value={newRole}
                    onChange={(e) => {
                      const r = e.target.value;
                      setNewRole(r);
                      // super-admin doesn't need project selection
                      setAssignMode(r === 'super-admin' ? 'none' : 'select');
                      setSelectedProjects({});
                    }}>
                    {GLOBAL_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Super-admin: info banner — auto-added to all projects */}
              {isSuperAdminRole ? (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-yellow-500/8 border border-yellow-500/25">
                  <Crown className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-white font-medium">Accès total — tous les projets</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Le super-admin est automatiquement ajouté comme propriétaire de tous les projets existants et futurs.
                    </p>
                  </div>
                </div>
              ) : (
                /* Admin / Member: project assignment is REQUIRED */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-white">
                      Projet(s) assigné(s) <span className="text-red-400">*</span>
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      newRole === 'admin'
                        ? 'text-accent bg-accent/10 border-accent/30'
                        : 'text-slate-300 bg-slate-700/50 border-slate-600'
                    }`}>
                      Rôle projet : {newRole === 'admin' ? 'Admin projet' : 'Membre'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(['all', 'select'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setAssignMode(m)}
                        className={`p-3 rounded-lg border text-left transition-all ${assignMode === m
                          ? 'border-accent bg-accent/10 text-white'
                          : 'border-slate-700 bg-surface-200/30 text-slate-400 hover:border-slate-600'}`}>
                        <p className="text-xs font-semibold">
                          {m === 'all' ? 'Tous les projets' : 'Sélectionner'}
                        </p>
                        <p className="text-xs opacity-70 mt-0.5">
                          {m === 'all' ? `${(projects as any[]).length} projet(s) actuel(s)` : 'Choisir manuellement'}
                        </p>
                      </button>
                    ))}
                  </div>

                  {assignMode === 'select' && (
                    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
                      {(projects as any[]).length === 0 ? (
                        <p className="p-4 text-xs text-slate-500 text-center">Aucun projet disponible — créez un projet d'abord.</p>
                      ) : (projects as any[]).map((project, i) => {
                        const checked = !!selectedProjects[project.id];
                        return (
                          <div key={project.id}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${i < (projects as any[]).length - 1 ? 'border-b border-slate-700/40' : ''} ${checked ? 'bg-accent/5' : 'hover:bg-surface-200/30'} transition-colors`}
                            onClick={() => toggleProject(project.id)}>
                            <span className="text-slate-400 hover:text-accent shrink-0">
                              {checked ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4" />}
                            </span>
                            <span className={`text-sm flex-1 select-none ${checked ? 'text-white' : 'text-slate-400'}`}>
                              {project.name}
                            </span>
                            {checked && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                newRole === 'admin' ? 'text-accent bg-accent/10' : 'text-slate-400 bg-slate-700/50'
                              }`}>
                                {newRole === 'admin' ? 'Admin projet' : 'Membre'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Validation hint */}
                  {!isProjectSelectionValid() && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Vous devez assigner au moins un projet.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-300/40 border border-slate-700/50">
                <Mail className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Un email sera envoyé avec un lien pour définir le mot de passe (valable 7 jours).
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button className="btn-ghost" onClick={resetForm}>Annuler</button>
                <button className="btn-primary" onClick={() => createMut.mutate()}
                  disabled={!newEmail || !isProjectSelectionValid() || createMut.isPending}>
                  {createMut.isPending ? 'Envoi...' : 'Créer et inviter'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Users table ── */}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Rôle global</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Créé le</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  isSelf={u.id === me?.id}
                  isSuperAdmin={isSuperAdmin}
                  projects={projects}
                  onRoleChange={(id, role) => roleMut.mutate({ id, role })}
                  onDelete={(u) => deleteMut.mutate(u.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="mt-6 card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Rôles globaux</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Crown className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">Super Admin</p>
              <p className="text-xs text-slate-500">Accès total + peut gérer utilisateurs et rôles.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">Admin</p>
              <p className="text-xs text-slate-500">Accès complet à tous les projets et paramètres.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UserCog className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">Membre</p>
              <p className="text-xs text-slate-500">Accès uniquement aux projets assignés.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
