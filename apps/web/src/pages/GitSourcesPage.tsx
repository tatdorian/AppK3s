import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Github, GitBranch, Plus, Trash2, Loader2, CheckCircle, AlertTriangle,
  Key, ExternalLink, Eye, EyeOff,
} from 'lucide-react';
import { gitApi } from '../lib/api.js';
import type { GitSource } from '@appk3s/shared';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';

// ─── OAuth redirect helpers ────────────────────────────────────────────────────

async function startGithubOAuth() {
  try {
    const url = await gitApi.getGithubOAuthUrl();
    window.location.href = url;
  } catch (err: any) {
    const msg = err?.response?.data?.error ?? err?.message ?? 'Erreur lors de la connexion GitHub';
    toast.error(msg);
  }
}

async function startGitlabOAuth() {
  try {
    const url = await gitApi.getGitlabOAuthUrl();
    window.location.href = url;
  } catch (err: any) {
    const msg = err?.response?.data?.error ?? err?.message ?? 'Erreur lors de la connexion GitLab';
    toast.error(msg);
  }
}

const PROVIDER_META = {
  github: { label: 'GitHub', icon: Github, color: 'text-white', bg: 'bg-slate-800' },
  gitlab: { label: 'GitLab', icon: GitBranch, color: 'text-orange-400', bg: 'bg-orange-500/10' },
};

// ─── PAT form ─────────────────────────────────────────────────────────────────

function AddPatForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<'github' | 'gitlab'>('github');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://gitlab.com');
  const [showToken, setShowToken] = useState(false);

  const addMut = useMutation({
    mutationFn: () => gitApi.addSource({ provider, name, accessToken: token, baseUrl: provider === 'gitlab' ? baseUrl : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-sources'] });
      toast.success('Source git ajoutée avec succès');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Erreur'),
  });

  return (
    <div className="card p-5 space-y-4 border-accent/30">
      <h3 className="text-sm font-semibold text-white">Ajouter via token d'accès (PAT)</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fournisseur</label>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as any)}>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </select>
        </div>
        <div>
          <label className="label">Nom (affiché)</label>
          <input
            className="input"
            placeholder={provider === 'github' ? 'Mon compte GitHub' : 'Mon compte GitLab'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      {provider === 'gitlab' && (
        <div>
          <label className="label">URL GitLab</label>
          <input
            className="input"
            placeholder="https://gitlab.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-xs text-slate-600 mt-1">Laissez la valeur par défaut pour GitLab.com</p>
        </div>
      )}

      <div>
        <label className="label">
          Token d'accès (PAT)
          {provider === 'github' && (
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:user"
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-accent hover:underline text-xs inline-flex items-center gap-1"
            >
              Créer un token <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </label>
        <div className="relative">
          <input
            className="input pr-10"
            type={showToken ? 'text' : 'password'}
            placeholder={provider === 'github' ? 'ghp_xxxxxxxxxxxx' : 'glpat-xxxxxxxxxxxx'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Scopes requis : <code className="text-slate-500">repo</code> + <code className="text-slate-500">read:user</code>
        </p>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="btn-ghost text-sm">Annuler</button>
        <button
          type="button"
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending || !token}
          className="btn-primary text-sm"
        >
          {addMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          Ajouter
        </button>
      </div>
    </div>
  );
}

// ─── Source card ───────────────────────────────────────────────────────────────

function SourceCard({ source, onDelete }: { source: GitSource; onDelete: () => void }) {
  const meta = PROVIDER_META[source.provider] ?? PROVIDER_META.github;
  const Icon = meta.icon;

  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${meta.bg}`}>
        <Icon className={`w-5 h-5 ${meta.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-white text-sm">{source.name}</p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">{meta.label}</span>
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
        </div>
        {source.username && (
          <p className="text-xs text-slate-500 mt-0.5">@{source.username}</p>
        )}
        {source.scopes && (
          <p className="text-xs text-slate-600 mt-0.5">Scopes : {source.scopes}</p>
        )}
      </div>
      <button
        onClick={onDelete}
        className="btn-ghost p-2 text-slate-500 hover:text-red-400"
        title="Supprimer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function GitSourcesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const connected = searchParams.get('connected');
  const oauthError = searchParams.get('error');
  const [showPatForm, setShowPatForm] = useState(false);

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['git-sources'],
    queryFn: gitApi.listSources,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => gitApi.deleteSource(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-sources'] });
      toast.success('Source supprimée');
    },
  });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Sources Git</h1>
        <p className="text-slate-400 text-sm mt-1">
          Connectez vos comptes GitHub et GitLab pour déployer directement depuis vos dépôts.
        </p>
      </div>

      {/* OAuth status banners */}
      {connected && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm mb-6">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Compte {connected === 'github' ? 'GitHub' : 'GitLab'} connecté avec succès !
        </div>
      )}
      {oauthError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Erreur OAuth : {decodeURIComponent(oauthError)}
        </div>
      )}

      {/* OAuth connect buttons */}
      <div className="card p-5 mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Connexion via OAuth</h2>
        <p className="text-xs text-slate-500">
          La méthode recommandée — accès complet à vos dépôts sans exposer de token.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={startGithubOAuth}
            className="flex-1 btn-ghost flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <Github className="w-4 h-4" />
            Connecter GitHub
          </button>
          <button
            type="button"
            onClick={startGitlabOAuth}
            className="flex-1 btn-ghost flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <GitBranch className="w-4 h-4 text-orange-400" />
            Connecter GitLab
          </button>
        </div>
        <p className="text-xs text-slate-600">
          ⚠ L'OAuth doit être configuré dans les Paramètres (Client ID + Secret) avant utilisation.
        </p>
      </div>

      {/* PAT form toggle */}
      {showPatForm ? (
        <AddPatForm onClose={() => setShowPatForm(false)} />
      ) : (
        <button
          onClick={() => setShowPatForm(true)}
          className="w-full card p-4 flex items-center gap-3 text-slate-400 hover:text-white hover:border-slate-600 transition-all mb-6 text-sm"
        >
          <Plus className="w-4 h-4" />
          Ajouter via token d'accès personnel (PAT)
        </button>
      )}

      {/* Sources list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Sources connectées ({sources.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : sources.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            <GitBranch className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p>Aucune source git connectée</p>
            <p className="text-xs mt-1">Connectez GitHub ou GitLab pour commencer à déployer depuis vos dépôts.</p>
          </div>
        ) : (
          sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onDelete={() => {
                if (confirm(`Supprimer la source "${source.name}" ?`)) {
                  deleteMut.mutate(source.id);
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
