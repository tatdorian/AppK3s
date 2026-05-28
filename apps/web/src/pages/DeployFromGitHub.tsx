/**
 * Wizard de déploiement GitHub — Coolify-style
 *
 * Étape 1 : Source (public URL ou private via GitHub App)
 *           → Si GitHub App absente / non installée : guide de setup intégré
 * Étape 2 : Repo + branche (picker ou saisie manuelle)
 * Étape 3 : Configuration complète (build, ports, domain, env vars)
 *           → Auto-détection du build type
 *           → Création + premier déploiement
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github, Lock, Globe, GitBranch, Search, Loader2,
  ChevronRight, ChevronLeft, CheckCircle,
  Zap, FileCode2, Package, LayoutTemplate, RefreshCw,
  Settings, ExternalLink, Terminal, PlusIcon,
} from 'lucide-react';

// Small inline Plus icon (avoid conflict with lucide PlusIcon name)
function PlusBtn({ className }: { className?: string }) {
  return <PlusIcon className={className} />;
}
import { githubAppApi, appsApi } from '../lib/api.js';
import type { GithubInstallation, GitRepo, GitBranch as GitBranchType, DetectedBuild } from '@appk3s/shared';
import { EnvVarsEditor } from '../components/EnvVarsEditor.js';
import type { EnvVar } from '@appk3s/shared';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

type RepoMode = 'private' | 'public';
type BuildType = 'nixpacks' | 'dockerfile' | 'docker-compose' | 'static';

const BUILD_PACKS: { value: BuildType; icon: any; label: string; desc: string }[] = [
  { value: 'nixpacks',       icon: Zap,           label: 'Nixpacks',         desc: 'Détection automatique du langage (Node, Python, Go, Rust…)' },
  { value: 'dockerfile',     icon: FileCode2,      label: 'Dockerfile',       desc: 'Utilise le Dockerfile présent dans le dépôt' },
  { value: 'docker-compose', icon: Package,        label: 'Docker Compose',   desc: 'Utilise docker-compose.yml (multi-services)' },
  { value: 'static',         icon: LayoutTemplate, label: 'Site statique',    desc: 'HTML/CSS/JS servis par nginx (React build, Vue, etc.)' },
];

// ── Sous-composants ────────────────────────────────────────────────────────────

function SetupGithubApp({ onDone }: { onDone: () => void }) {
  const [appExists, setAppExists] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    githubAppApi.getApp()
      .then(() => setAppExists(true))
      .catch(() => setAppExists(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { manifest, githubUrl } = await githubAppApi.getManifestData();
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = githubUrl;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'manifest';
      input.value = manifest;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erreur lors de la création');
      setCreating(false);
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const url = await githubAppApi.getInstallUrl();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'GitHub App non configurée');
      setInstalling(false);
    }
  };

  if (appExists === null) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${appExists ? 'bg-green-500/20 text-green-400' : 'bg-accent text-black'}`}>
          {appExists ? <CheckCircle className="w-4 h-4" /> : '1'}
        </div>
        <div className="flex-1 h-px bg-slate-700" />
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${appExists ? 'bg-accent text-black' : 'bg-slate-700 text-slate-500'}`}>
          2
        </div>
      </div>

      {!appExists ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Créer la GitHub App</h3>
            <p className="text-sm text-slate-400">
              Une GitHub App permet à AppK3s d'accéder à vos dépôts privés sans exposer votre token personnel.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-blue-200 text-xs space-y-1.5">
            <p className="font-semibold text-blue-300">Comment ça fonctionne :</p>
            <p>① Vous créez une GitHub App liée à votre instance AppK3s</p>
            <p>② GitHub génère automatiquement les credentials sécurisés</p>
            <p>③ Vous installez l'App sur votre compte et choisissez les dépôts</p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
            Créer la GitHub App sur GitHub
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Installer sur votre compte GitHub</h3>
            <p className="text-sm text-slate-400">
              Choisissez les dépôts auxquels AppK3s doit avoir accès (publics et privés).
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 text-sm space-y-2">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>GitHub App configurée</span>
            </div>
            <p className="text-slate-400 text-xs">
              Cliquez sur "Installer" → choisissez votre compte ou organisation → sélectionnez les dépôts.
              Une fois installée, revenez ici et cliquez "J'ai installé".
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleInstall}
              disabled={installing}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Installer sur GitHub
              <ExternalLink className="w-3 h-3" />
            </button>
            <button onClick={onDone} className="btn-ghost text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              J'ai installé
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RepoCard({ repo, selected, onClick }: { repo: GitRepo; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full card p-3 flex items-center gap-3 text-left transition-all ${
        selected ? 'border-accent/60 bg-accent/5' : 'hover:border-slate-600'
      }`}
    >
      {repo.private ? <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" /> : <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{repo.fullName}</p>
        {repo.description && <p className="text-xs text-slate-500 truncate">{repo.description}</p>}
      </div>
      <span className="text-xs text-slate-600 flex-shrink-0 font-mono">{repo.defaultBranch}</span>
      {selected && <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  appName: string;
  namespace?: string;
  projectId?: string;
  onCancel: () => void;
}

export function DeployFromGitHub({ appName, namespace = 'default', projectId, onCancel }: Props) {
  const navigate = useNavigate();

  // ── Step 0 : Source
  const [mode, setMode] = useState<RepoMode | null>(null);
  const [installations, setInstallations] = useState<GithubInstallation[]>([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedInst, setSelectedInst] = useState<GithubInstallation | null>(null);

  // ── Step 1 : Repo
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitRepo | null>(null);
  const [publicUrl, setPublicUrl] = useState('');

  // ── Step 2 : Branch
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branch, setBranch] = useState('main');

  // ── Step 3 : Config
  const [detected, setDetected] = useState<DetectedBuild | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [buildType, setBuildType] = useState<BuildType>('nixpacks');
  const [baseDir, setBaseDir] = useState('/');
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile');
  const [installCmd, setInstallCmd] = useState('');
  const [buildCmd, setBuildCmd] = useState('');
  const [startCmd, setStartCmd] = useState('');
  const [publishDir, setPublishDir] = useState('');
  const [port, setPort] = useState('3000');
  const [subdomain, setSubdomain] = useState(appName);
  const [domain, setDomain] = useState('');
  const [tlsEnabled, setTlsEnabled] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [autoDeploy, setAutoDeploy] = useState(true);

  // ── Wizard steps
  type WizardStep = 'source' | 'repo' | 'config';
  const [step, setStep] = useState<WizardStep>('source');
  const [submitting, setSubmitting] = useState(false);

  // Load default domain from settings
  useEffect(() => {
    // Load cluster wildcard domain from settings
    fetch('/api/settings', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => r.json())
      .then((s: any) => {
        if (s?.wildcardDomain) setDomain(s.wildcardDomain);
        if (s?.defaultTls && s?.wildcardDomain) setTlsEnabled(true);
      })
      .catch(() => {});
  }, []);

  // ── Source selection logic ─────────────────────────────────────────────────

  const handleSelectMode = async (m: RepoMode) => {
    setMode(m);
    if (m === 'private') {
      setLoadingInst(true);
      try {
        const list = await githubAppApi.listInstallations();
        setInstallations(list);
        if (list.length === 0) setShowSetup(true);
      } catch {
        setShowSetup(true);
      } finally {
        setLoadingInst(false);
      }
    }
  };

  // After setup, reload installations
  const handleSetupDone = async () => {
    setShowSetup(false);
    setLoadingInst(true);
    try {
      const list = await githubAppApi.listInstallations();
      setInstallations(list);
    } finally {
      setLoadingInst(false);
    }
  };

  // ── Repo loading ───────────────────────────────────────────────────────────

  const loadRepos = async (inst: GithubInstallation) => {
    setSelectedInst(inst);
    setLoadingRepos(true);
    setSelectedRepo(null);
    try {
      const list = await githubAppApi.listRepos(inst.id);
      setRepos(list);
    } catch {
      toast.error('Impossible de charger les dépôts');
    } finally {
      setLoadingRepos(false);
    }
  };

  const goToRepo = () => {
    if (mode === 'public' && !publicUrl.trim()) return;
    if (mode === 'private' && !selectedInst) return;
    setStep('repo');
    if (mode === 'private' && selectedInst && repos.length === 0) {
      loadRepos(selectedInst);
    }
  };

  // ── Branch loading ─────────────────────────────────────────────────────────

  const selectRepo = async (repo: GitRepo) => {
    setSelectedRepo(repo);
    setBranch(repo.defaultBranch);
    setLoadingBranches(true);
    try {
      if (mode === 'private' && selectedInst) {
        const list = await githubAppApi.listBranches(selectedInst.id, repo.fullName);
        setBranches(list);
      }
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  // ── Detect build type ──────────────────────────────────────────────────────

  const detectBuild = async () => {
    if (!selectedInst || !selectedRepo) return;
    setDetecting(true);
    try {
      const d = await githubAppApi.detectBuild(selectedInst.id, selectedRepo.fullName, branch);
      setDetected(d);
      setBuildType(d.buildType);
      if (d.buildType === 'static') setPublishDir('dist');
    } catch {
      // silent
    } finally {
      setDetecting(false);
    }
  };

  const goToConfig = () => {
    setStep('config');
    detectBuild();
    // Set subdomain from repo name
    if (selectedRepo) {
      const slug = selectedRepo.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);
      setSubdomain(slug);
    } else if (publicUrl) {
      try {
        const u = new URL(publicUrl.startsWith('http') ? publicUrl : `https://${publicUrl}`);
        const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
        if (parts.length) setSubdomain(parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40));
      } catch {}
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const repoUrl = mode === 'public'
        ? (publicUrl.startsWith('http') ? publicUrl : `https://github.com/${publicUrl}`)
        : selectedRepo!.url;

      const portNum = parseInt(port) || 3000;

      const payload: any = {
        name: appName,
        namespace,
        projectId: projectId || undefined,
        type: mode === 'private' ? 'github-app' : 'git',
        gitRepoUrl: repoUrl,
        gitBranch: branch,
        buildType,
        baseDir: baseDir !== '/' ? baseDir : undefined,
        dockerfilePath: buildType === 'dockerfile' && dockerfilePath !== 'Dockerfile' ? dockerfilePath : undefined,
        installCommand: installCmd || undefined,
        buildCommand: buildCmd || undefined,
        startCommand: startCmd || undefined,
        publishDir: publishDir || undefined,
        autoDeploy,
        envVars,
        ports: [{ containerPort: portNum, protocol: 'TCP' }],
        volumes: [],
        subdomain: subdomain || appName,
        domain: domain || undefined,
        ingressClass: 'traefik',
        tlsEnabled,
        replicas: 1,
        imageTag: 'latest',
      };

      if (mode === 'private' && selectedInst) {
        payload.githubInstallationId = selectedInst.id;
        payload.githubRepoFullName = selectedRepo!.fullName;
      }

      const created = await appsApi.create(payload);
      toast.success('Application créée — déploiement en cours…');
      await appsApi.deploy(created.id);
      navigate(`/apps/${created.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Erreur de création');
      setSubmitting(false);
    }
  };

  // ── Filtered repos ─────────────────────────────────────────────────────────
  const filteredRepos = repos.filter((r) =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Step: Source ──────────────────────────────────────────────────── */}
      {step === 'source' && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Choisir la source</h3>
            <p className="text-sm text-slate-400">Dépôt public ou privé via GitHub App ?</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleSelectMode('public')}
              className={`card p-4 flex flex-col gap-2 text-left transition-all ${
                mode === 'public' ? 'border-accent/60 bg-accent/5' : 'hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-slate-300" />
                <span className="text-white font-medium text-sm">Dépôt public</span>
                {mode === 'public' && <CheckCircle className="w-4 h-4 text-accent ml-auto" />}
              </div>
              <p className="text-xs text-slate-500">Entrez l'URL GitHub — aucune auth requise.</p>
            </button>

            <button
              onClick={() => handleSelectMode('private')}
              className={`card p-4 flex flex-col gap-2 text-left transition-all ${
                mode === 'private' ? 'border-accent/60 bg-accent/5' : 'hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-yellow-400" />
                <span className="text-white font-medium text-sm">Dépôt privé</span>
                {mode === 'private' && <CheckCircle className="w-4 h-4 text-accent ml-auto" />}
              </div>
              <p className="text-xs text-slate-500">Via GitHub App — accès sécurisé par dépôt.</p>
            </button>
          </div>

          {/* Public URL input */}
          {mode === 'public' && (
            <div>
              <label className="label">URL du dépôt GitHub</label>
              <input
                className="input"
                placeholder="https://github.com/owner/repo  ou  owner/repo"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* Private: installations or setup */}
          {mode === 'private' && (
            <div className="space-y-3">
              {loadingInst ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
              ) : showSetup ? (
                <SetupGithubApp onDone={handleSetupDone} />
              ) : installations.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 uppercase font-semibold tracking-wide">Compte GitHub</p>
                  {installations.map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => { setSelectedInst(inst); loadRepos(inst); }}
                      className={`w-full card p-3 flex items-center gap-3 text-left transition-all ${
                        selectedInst?.id === inst.id ? 'border-accent/60 bg-accent/5' : 'hover:border-slate-600'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
                        {inst.accountAvatarUrl
                          ? <img src={inst.accountAvatarUrl} alt={inst.accountLogin} className="w-full h-full object-cover" />
                          : <Github className="w-4 h-4 m-2 text-slate-400" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{inst.accountLogin}</p>
                        <p className="text-xs text-slate-500">{inst.accountType}</p>
                      </div>
                      {selectedInst?.id === inst.id && <CheckCircle className="w-4 h-4 text-accent" />}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowSetup(true)}
                    className="w-full text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 py-1"
                  >
                    <PlusBtn className="w-3 h-3" /> Ajouter un compte
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={onCancel} className="btn-ghost text-sm">Annuler</button>
            <button
              onClick={goToRepo}
              disabled={
                !mode ||
                (mode === 'public' && !publicUrl.trim()) ||
                (mode === 'private' && (!selectedInst || showSetup))
              }
              className="btn-primary text-sm flex items-center gap-2"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Repo + Branch ────────────────────────────────────────────── */}
      {step === 'repo' && (
        <div className="space-y-5">
          {mode === 'private' ? (
            <>
              <div>
                <h3 className="text-base font-semibold text-white mb-1">Sélectionner un dépôt</h3>
                <p className="text-sm text-slate-400">
                  Dépôts de <strong className="text-white">{selectedInst?.accountLogin}</strong>
                </p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="input pl-9"
                  placeholder="Filtrer les dépôts…"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                />
              </div>
              {loadingRepos ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredRepos.map((repo) => (
                    <RepoCard
                      key={repo.id}
                      repo={repo}
                      selected={selectedRepo?.id === repo.id}
                      onClick={() => selectRepo(repo)}
                    />
                  ))}
                  {filteredRepos.length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-4">Aucun dépôt trouvé</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">Dépôt public</h3>
                <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 font-mono text-sm text-slate-300 break-all">
                  {publicUrl}
                </div>
              </div>
            </div>
          )}

          {/* Branch selection */}
          <div>
            <label className="label flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5" /> Branche
            </label>
            {loadingBranches ? (
              <div className="flex items-center gap-2 input text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
              </div>
            ) : branches.length > 0 ? (
              <select
                className="input"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            )}
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep('source')} className="btn-ghost text-sm flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
            <button
              onClick={goToConfig}
              disabled={mode === 'private' && !selectedRepo}
              className="btn-primary text-sm flex items-center gap-2"
            >
              Configurer <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Config (Coolify-style full config) ───────────────────────── */}
      {step === 'config' && (
        <div className="space-y-5">

          {/* ── Repo summary ── */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700">
            <Github className="w-5 h-5 text-white flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {mode === 'private' ? selectedRepo?.fullName : publicUrl}
              </p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <GitBranch className="w-3 h-3" /> {branch}
              </p>
            </div>
            <button onClick={() => setStep('repo')} className="btn-ghost p-1.5 text-xs text-slate-500">
              Modifier
            </button>
          </div>

          {/* ── Build Pack ── */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-accent" /> Build Pack
              </h4>
              {mode === 'private' && (
                <button
                  onClick={detectBuild}
                  disabled={detecting}
                  className="btn-ghost py-1 px-2 text-xs flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${detecting ? 'animate-spin' : ''}`} />
                  Auto-détecter
                </button>
              )}
            </div>

            {detected && (
              <div className="text-xs px-3 py-2 rounded bg-slate-800 text-slate-400">
                Détecté : <span className="text-accent font-medium">{detected.buildType}</span>
                {detected.nixpacksLanguage && <span className="text-slate-500"> ({detected.nixpacksLanguage})</span>}
                {' '}— confiance : <span className={detected.confidence === 'high' ? 'text-green-400' : 'text-yellow-400'}>{detected.confidence}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {BUILD_PACKS.map((bp) => {
                const Icon = bp.icon;
                return (
                  <button
                    key={bp.value}
                    type="button"
                    onClick={() => setBuildType(bp.value)}
                    className={`p-3 rounded-lg border text-left transition-all flex items-start gap-2.5 ${
                      buildType === bp.value
                        ? 'border-accent/60 bg-accent/5'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-white text-xs font-medium">{bp.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{bp.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Build settings ── */}
          <div className="card p-4 space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-accent" /> Paramètres de build
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Répertoire racine</label>
                <input
                  className="input font-mono text-sm"
                  placeholder="/"
                  value={baseDir}
                  onChange={(e) => setBaseDir(e.target.value)}
                />
                <p className="text-xs text-slate-600 mt-1">Répertoire de base dans le dépôt</p>
              </div>
              {buildType === 'dockerfile' && (
                <div>
                  <label className="label">Chemin Dockerfile</label>
                  <input
                    className="input font-mono text-sm"
                    placeholder="Dockerfile"
                    value={dockerfilePath}
                    onChange={(e) => setDockerfilePath(e.target.value)}
                  />
                </div>
              )}
              {buildType === 'nixpacks' && (
                <>
                  <div>
                    <label className="label">Commande d'installation</label>
                    <input
                      className="input font-mono text-sm"
                      placeholder="npm install  (auto-détecté)"
                      value={installCmd}
                      onChange={(e) => setInstallCmd(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Commande de build</label>
                    <input
                      className="input font-mono text-sm"
                      placeholder="npm run build  (auto-détecté)"
                      value={buildCmd}
                      onChange={(e) => setBuildCmd(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Commande de démarrage</label>
                    <input
                      className="input font-mono text-sm"
                      placeholder="npm start  (auto-détecté)"
                      value={startCmd}
                      onChange={(e) => setStartCmd(e.target.value)}
                    />
                  </div>
                </>
              )}
              {buildType === 'static' && (
                <div>
                  <label className="label">Répertoire de publication</label>
                  <input
                    className="input font-mono text-sm"
                    placeholder="dist"
                    value={publishDir}
                    onChange={(e) => setPublishDir(e.target.value)}
                  />
                  <p className="text-xs text-slate-600 mt-1">dist, build, public, out…</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Network ── */}
          <div className="card p-4 space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" /> Réseau
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Port de l'application</label>
                <input
                  className="input"
                  type="number"
                  placeholder="3000"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Sous-domaine</label>
                <input
                  className="input font-mono text-sm"
                  placeholder="mon-app"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                />
              </div>
              <div className="col-span-2">
                <label className="label">Domaine</label>
                <input
                  className="input"
                  placeholder="app.example.com  (laissez vide = wildcard par défaut)"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tlsEnabled}
                onChange={(e) => setTlsEnabled(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <div>
                <p className="text-white text-sm">HTTPS / TLS</p>
                <p className="text-xs text-slate-500">Activer Let's Encrypt via cert-manager</p>
              </div>
            </label>
          </div>

          {/* ── Environment Variables ── */}
          <div className="card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-white">Variables d'environnement</h4>
            <EnvVarsEditor value={envVars} onChange={setEnvVars} />
          </div>

          {/* ── Auto-deploy ── */}
          <div className="card p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoDeploy}
                onChange={(e) => setAutoDeploy(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <div>
                <p className="text-white text-sm font-medium">Déploiement automatique</p>
                <p className="text-xs text-slate-500">
                  Redéployer automatiquement à chaque push sur <code className="text-accent">{branch}</code>
                </p>
              </div>
            </label>
          </div>

          {/* ── Actions ── */}
          <div className="flex justify-between pt-2 border-t border-slate-700">
            <button onClick={() => setStep('repo')} className="btn-ghost text-sm flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Créer et déployer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

