/**
 * DeployFromGit — Coolify-like "deploy from git repo" flow.
 * Embedded as a card inside CreateApp when the user selects the "Git" option.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Github, GitBranch, Search, Loader2, CheckCircle, AlertTriangle,
  ChevronDown, RefreshCw, Zap, FileCode, Layers, Globe2,
} from 'lucide-react';
import { gitApi } from '../lib/api.js';
import type { GitSource, GitRepo, GitBranch as GitBranchType, DetectedBuild, BuildType } from '@appk3s/shared';
import { Link } from 'react-router-dom';

// ─── Build type metadata ───────────────────────────────────────────────────────

const BUILD_TYPE_META: Record<BuildType, { icon: React.ReactNode; label: string; description: string; color: string }> = {
  nixpacks: {
    icon: <Zap className="w-4 h-4" />,
    label: 'Nixpacks',
    description: 'Détection automatique du langage (Node, Python, Go, Ruby, PHP, Rust…)',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  },
  dockerfile: {
    icon: <FileCode className="w-4 h-4" />,
    label: 'Dockerfile',
    description: 'Construit depuis le Dockerfile à la racine du projet',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
  'docker-compose': {
    icon: <Layers className="w-4 h-4" />,
    label: 'Docker Compose',
    description: 'Déploie les services définis dans docker-compose.yml',
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  },
  static: {
    icon: <Globe2 className="w-4 h-4" />,
    label: 'Statique',
    description: 'Sert les fichiers HTML/CSS/JS via nginx',
    color: 'text-green-400 bg-green-500/10 border-green-500/30',
  },
};

const LANG_ICONS: Record<string, string> = {
  node: '🟩', python: '🐍', go: '🐹', rust: '🦀', ruby: '💎',
  php: '🐘', java: '☕', elixir: '💧', dart: '🎯', dotnet: '🔷',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitDeployConfig {
  gitSourceId: string;
  gitRepoUrl: string;
  gitBranch: string;
  buildType: BuildType;
  buildDir: string;
  dockerfilePath: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  publishDir: string;
  autoDeploy: boolean;
}

interface Props {
  onChange: (config: GitDeployConfig | null) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeployFromGit({ onChange }: Props) {
  const [selectedSource, setSelectedSource] = useState<GitSource | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitRepo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [detected, setDetected] = useState<DetectedBuild | null>(null);
  const [buildType, setBuildType] = useState<BuildType>('nixpacks');
  const [buildDir, setBuildDir] = useState('.');
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile');
  const [installCommand, setInstallCommand] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [publishDir, setPublishDir] = useState('public');
  const [autoDeploy, setAutoDeploy] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch git sources
  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ['git-sources'],
    queryFn: gitApi.listSources,
  });

  // Fetch repos for selected source
  const { data: repos = [], isLoading: reposLoading, refetch: refetchRepos } = useQuery({
    queryKey: ['git-repos', selectedSource?.id],
    queryFn: () => gitApi.listRepos(selectedSource!.id),
    enabled: !!selectedSource,
  });

  // Fetch branches for selected repo
  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['git-branches', selectedSource?.id, selectedRepo?.fullName],
    queryFn: () => gitApi.listBranches(selectedSource!.id, selectedRepo!.fullName),
    enabled: !!selectedSource && !!selectedRepo,
  });

  // Detect build type when repo + branch selected
  const { data: detection, isLoading: detectLoading } = useQuery({
    queryKey: ['git-detect', selectedSource?.id, selectedRepo?.fullName, selectedBranch],
    queryFn: () => gitApi.detectBuild(selectedSource!.id, selectedRepo!.fullName, selectedBranch),
    enabled: !!selectedSource && !!selectedRepo && !!selectedBranch,
  });

  useEffect(() => {
    if (detection) {
      setDetected(detection);
      setBuildType(detection.buildType);
    }
  }, [detection]);

  // Set default branch from repo
  useEffect(() => {
    if (selectedRepo) {
      setSelectedBranch(selectedRepo.defaultBranch);
    }
  }, [selectedRepo]);

  // Notify parent of config changes
  useEffect(() => {
    if (!selectedSource || !selectedRepo) {
      onChange(null);
      return;
    }
    onChange({
      gitSourceId: selectedSource.id,
      gitRepoUrl: selectedRepo.url,
      gitBranch: selectedBranch,
      buildType,
      buildDir,
      dockerfilePath,
      installCommand,
      buildCommand,
      startCommand,
      publishDir,
      autoDeploy,
    });
  }, [
    selectedSource, selectedRepo, selectedBranch, buildType,
    buildDir, dockerfilePath, installCommand, buildCommand,
    startCommand, publishDir, autoDeploy,
  ]);

  const filteredRepos = repos.filter(
    (r) =>
      !repoSearch ||
      r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
      r.fullName.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  const providerIcon = (provider: string) =>
    provider === 'github' ? <Github className="w-4 h-4" /> : <GitBranch className="w-4 h-4 text-orange-400" />;

  // ── No sources ───────────────────────────────────────────────────────────────
  if (!sourcesLoading && sources.length === 0) {
    return (
      <div className="card p-6 text-center space-y-3">
        <Github className="w-10 h-10 mx-auto text-slate-600" />
        <div>
          <p className="text-white font-semibold">Aucune source git connectée</p>
          <p className="text-slate-500 text-sm mt-1">
            Connectez votre compte GitHub ou GitLab pour déployer depuis vos dépôts.
          </p>
        </div>
        <Link to="/git-sources" className="btn-primary text-sm inline-flex items-center gap-2 mx-auto">
          <Github className="w-4 h-4" />
          Connecter GitHub / GitLab
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Step 1: Select git source ───────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">1</span>
          Compte Git
        </h3>
        {sourcesLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {sources.map((src) => (
              <button
                key={src.id}
                onClick={() => { setSelectedSource(src); setSelectedRepo(null); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                  selectedSource?.id === src.id
                    ? 'border-accent bg-accent/10 text-white'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                }`}
              >
                {providerIcon(src.provider)}
                {src.name}
                {src.username && <span className="text-slate-500">@{src.username}</span>}
              </button>
            ))}
            <Link
              to="/git-sources"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300 text-sm transition-all"
            >
              + Ajouter un compte
            </Link>
          </div>
        )}
      </div>

      {/* ── Step 2: Select repo ─────────────────────────────────────────────── */}
      {selectedSource && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">2</span>
              Dépôt
            </h3>
            <button
              onClick={() => refetchRepos()}
              className="btn-ghost p-1.5 text-slate-500"
              title="Rafraîchir"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              className="input pl-8 text-sm"
              placeholder="Rechercher un dépôt…"
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
            />
          </div>

          {reposLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {filteredRepos.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Aucun dépôt trouvé</p>
              ) : (
                filteredRepos.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => setSelectedRepo(repo)}
                    className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                      selectedRepo?.id === repo.id
                        ? 'bg-accent/10 border border-accent/30'
                        : 'hover:bg-surface-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{repo.name}</span>
                        {repo.private && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Privé</span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{repo.description}</p>
                      )}
                    </div>
                    {selectedRepo?.id === repo.id && (
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Select branch ────────────────────────────────────────────── */}
      {selectedRepo && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">3</span>
            Branche
          </h3>
          {branchesLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => (
                <button
                  key={b.name}
                  onClick={() => setSelectedBranch(b.name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    selectedBranch === b.name
                      ? 'border-accent bg-accent/10 text-white'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <GitBranch className="w-3 h-3" />
                  {b.name}
                  {b.protected && <span className="text-slate-500">(protégé)</span>}
                </button>
              ))}
              {/* Manual input if branches couldn't be loaded */}
              {branches.length === 0 && (
                <div className="flex-1">
                  <input
                    className="input text-sm"
                    placeholder="Nom de la branche (ex: main)"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Build type (auto-detected) ─────────────────────────────── */}
      {selectedRepo && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">4</span>
              Type de build
            </h3>
            {detectLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
            {detected && !detectLoading && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Détecté automatiquement
                {detected.nixpacksLanguage && (
                  <span className="ml-1">{LANG_ICONS[detected.nixpacksLanguage] ?? ''} {detected.nixpacksLanguage}</span>
                )}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(BUILD_TYPE_META) as [BuildType, typeof BUILD_TYPE_META[BuildType]][]).map(
              ([type, meta]) => (
                <button
                  key={type}
                  onClick={() => setBuildType(type)}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    buildType === type
                      ? `${meta.color} border-current`
                      : 'border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <span className="mt-0.5">{meta.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{meta.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{meta.description}</p>
                  </div>
                </button>
              ),
            )}
          </div>

          {/* Auto-deploy toggle */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={autoDeploy}
              onChange={(e) => setAutoDeploy(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            <span className="text-sm text-slate-300">Déploiement automatique à chaque push</span>
          </label>
        </div>
      )}

      {/* ── Step 5: Advanced build config ──────────────────────────────────── */}
      {selectedRepo && (
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-400 hover:text-white hover:bg-surface-200/30 transition-colors"
          >
            <span>Configuration avancée du build</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-700/40 pt-3">
              {buildType !== 'static' && (
                <div>
                  <label className="label text-xs">Répertoire de build</label>
                  <input
                    className="input text-sm"
                    placeholder="."
                    value={buildDir}
                    onChange={(e) => setBuildDir(e.target.value)}
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    Sous-répertoire du repo à utiliser comme racine du build (ex: <code>./backend</code>)
                  </p>
                </div>
              )}

              {buildType === 'dockerfile' && (
                <div>
                  <label className="label text-xs">Chemin du Dockerfile</label>
                  <input
                    className="input text-sm"
                    placeholder="Dockerfile"
                    value={dockerfilePath}
                    onChange={(e) => setDockerfilePath(e.target.value)}
                  />
                </div>
              )}

              {buildType === 'nixpacks' && (
                <>
                  <div>
                    <label className="label text-xs">Commande d'installation (optionnel)</label>
                    <input className="input text-sm font-mono" placeholder="npm install" value={installCommand} onChange={(e) => setInstallCommand(e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Commande de build (optionnel)</label>
                    <input className="input text-sm font-mono" placeholder="npm run build" value={buildCommand} onChange={(e) => setBuildCommand(e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Commande de démarrage (optionnel)</label>
                    <input className="input text-sm font-mono" placeholder="node server.js" value={startCommand} onChange={(e) => setStartCommand(e.target.value)} />
                  </div>
                </>
              )}

              {buildType === 'static' && (
                <>
                  <div>
                    <label className="label text-xs">Commande de build</label>
                    <input className="input text-sm font-mono" placeholder="npm run build" value={buildCommand} onChange={(e) => setBuildCommand(e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Répertoire de sortie</label>
                    <input className="input text-sm" placeholder="dist" value={publishDir} onChange={(e) => setPublishDir(e.target.value)} />
                    <p className="text-xs text-slate-600 mt-1">Répertoire contenant les fichiers statiques générés (ex: <code>dist</code>, <code>build</code>, <code>out</code>)</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
