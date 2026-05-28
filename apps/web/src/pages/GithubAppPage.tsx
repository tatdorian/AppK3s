/**
 * GitHub App management page (/github-app)
 *
 * Chaque utilisateur authentifié peut créer sa propre GitHub App
 * et gérer ses propres installations.
 *
 * Flow de création :
 *  1. Cliquer "Créer la GitHub App"
 *  2. L'API retourne le manifest JSON + l'URL GitHub + un state signé (userId)
 *  3. Un <form> hidden est soumis vers GitHub (POST navigateur) avec ?state=STATE
 *  4. GitHub crée l'app → redirige vers /api/github-app/callback?code=...&state=...
 *  5. Le backend extrait le userId du state, stocke les credentials → redirige vers /github-app?created=1
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Github, Plus, Trash2, Loader2, CheckCircle, AlertTriangle,
  ExternalLink, Settings, RefreshCw,
} from 'lucide-react';
import { githubAppApi } from '../lib/api.js';
import type { GithubInstallation } from '@appk3s/shared';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';

// ─── Installation card ─────────────────────────────────────────────────────────

function InstallationCard({
  inst,
  onDelete,
}: {
  inst: GithubInstallation;
  onDelete: () => void;
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
        {inst.accountAvatarUrl
          ? <img src={inst.accountAvatarUrl} alt={inst.accountLogin} className="w-full h-full object-cover" />
          : <Github className="w-5 h-5 m-2.5 text-slate-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-white text-sm">{inst.accountLogin}</p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
            {inst.accountType}
          </span>
          {inst.suspended
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Suspendue</span>
            : <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          }
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Accès : {inst.repositorySelection === 'all' ? 'tous les dépôts' : 'dépôts sélectionnés'}
        </p>
      </div>
      <button
        onClick={onDelete}
        className="btn-ghost p-2 text-slate-500 hover:text-red-400"
        title="Supprimer l'installation"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function GithubAppPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);

  const created = searchParams.get('created');
  const errorParam = searchParams.get('error');

  // Each user sees their own GitHub App
  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['github-app'],
    queryFn: githubAppApi.getApp,
    retry: false,
  });

  const { data: installations = [], isLoading: installLoading, refetch: refetchInstall } = useQuery({
    queryKey: ['github-installations'],
    queryFn: githubAppApi.listInstallations,
  });

  const deleteAppMut = useMutation({
    mutationFn: githubAppApi.deleteApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['github-app'] });
      toast.success('GitHub App supprimée');
    },
  });

  const deleteInstMut = useMutation({
    mutationFn: (id: string) => githubAppApi.deleteInstallation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['github-installations'] });
      toast.success('Installation supprimée');
    },
  });

  // Submit the manifest form to GitHub, including the signed user state
  const handleCreateApp = async () => {
    setCreating(true);
    try {
      const { manifest, githubUrl, state } = await githubAppApi.getManifestData();

      const form = document.createElement('form');
      form.method = 'POST';
      // Pass state as URL param so GitHub includes it in the redirect
      form.action = state ? `${githubUrl}?state=${encodeURIComponent(state)}` : githubUrl;
      form.target = '_self';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'manifest';
      input.value = manifest;
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();
      // Browser navigates away — no need to reset creating state
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Erreur');
      setCreating(false);
    }
  };

  const handleInstall = async () => {
    try {
      const url = await githubAppApi.getInstallUrl();
      window.location.href = url;
    } catch {
      toast.error('GitHub App non configurée. Créez-la d\'abord.');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Github className="w-6 h-6 text-white" />
          <h1 className="text-2xl font-bold text-white">GitHub App</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Créez votre propre GitHub App pour déployer vos dépôts (publics et privés) sans exposer de tokens personnels.
        </p>
      </div>

      {/* Banners */}
      {created && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm mb-6">
          <CheckCircle className="w-4 h-4 shrink-0" />
          GitHub App créée avec succès ! Installez-la maintenant sur votre compte GitHub.
        </div>
      )}
      {errorParam && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {decodeURIComponent(errorParam)}
        </div>
      )}

      {/* ── Ma GitHub App ──────────────────────────────────────────────────── */}
      <div className="card p-5 mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Ma GitHub App
          </h2>
          {app && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Active
            </span>
          )}
        </div>

        {appLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : app ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500 text-xs mb-1">Nom</p>
                <p className="text-white font-medium">{app.name}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">App ID</p>
                <p className="text-white font-mono">{app.appId}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Slug</p>
                <p className="text-slate-300 font-mono text-xs">{app.slug}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Lien GitHub</p>
                <a
                  href={app.htmlUrl ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline text-xs flex items-center gap-1"
                >
                  Voir sur GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleInstall}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Installer sur un compte GitHub
              </button>
              <a
                href={app.htmlUrl ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost text-sm flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Gérer sur GitHub
              </a>
              <button
                onClick={() => {
                  if (confirm('Supprimer ta GitHub App ? Toutes les installations seront perdues.')) {
                    deleteAppMut.mutate();
                  }
                }}
                className="btn-ghost text-sm text-red-400 hover:text-red-300 ml-auto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">
              Tu n'as pas encore de GitHub App. Crées-en une pour connecter tes dépôts GitHub.
            </p>
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-blue-300 text-xs space-y-1">
              <p className="font-medium">Comment ça marche :</p>
              <p>1. Clique "Créer ma GitHub App" → GitHub ouvre une page de confirmation</p>
              <p>2. Valide la création → AppK3s reçoit automatiquement les credentials</p>
              <p>3. Installe l'App sur ton compte ou organisation GitHub</p>
              <p>4. Choisis les dépôts auxquels donner accès</p>
              <p>5. Déploie directement depuis l'interface AppK3s</p>
            </div>
            <button
              onClick={handleCreateApp}
              disabled={creating}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {creating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Github className="w-4 h-4" />
              }
              Créer ma GitHub App
            </button>
          </div>
        )}
      </div>

      {/* ── Installations ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Comptes installés ({installations.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => refetchInstall()}
              className="btn-ghost p-1.5 text-slate-500 hover:text-white"
              title="Rafraîchir"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {app && (
              <button
                onClick={handleInstall}
                className="btn-ghost text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Installer
              </button>
            )}
          </div>
        </div>

        {installLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : installations.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            <Github className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="font-medium">Aucune installation</p>
            <p className="text-xs mt-1">
              {app
                ? 'Installe la GitHub App sur ton compte ou organisation GitHub.'
                : 'Crée d\'abord ta GitHub App.'}
            </p>
            {app && (
              <button
                onClick={handleInstall}
                className="btn-primary text-sm mt-4 inline-flex items-center gap-2"
              >
                <Github className="w-4 h-4" />
                Installer sur GitHub
              </button>
            )}
          </div>
        ) : (
          installations.map((inst) => (
            <InstallationCard
              key={inst.id}
              inst={inst}
              onDelete={() => {
                if (confirm(`Supprimer l'installation de "${inst.accountLogin}" ?`)) {
                  deleteInstMut.mutate(inst.id);
                }
              }}
            />
          ))
        )}
      </div>

      <div className="mt-8 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-400">Dépôts privés</p>
        <p>
          La GitHub App te permet de donner accès uniquement aux dépôts que tu choisis,
          sans exposer de token personnel. Les webhooks push sont automatiquement configurés
          pour le déploiement continu.
        </p>
      </div>
    </div>
  );
}
