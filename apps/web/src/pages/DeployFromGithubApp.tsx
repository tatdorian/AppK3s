/**
 * Wizard de déploiement depuis GitHub App
 * Étapes : Installation → Dépôt → Branche → Build → Config → Création
 */
import { useState, useEffect } from 'react';
import {
  Github, GitBranch, Search, Loader2, ChevronRight, ChevronLeft,
  Lock, Globe, CheckCircle, Settings, Zap, Package, FileCode2, LayoutTemplate,
  RefreshCw,
} from 'lucide-react';
import { githubAppApi, appsApi } from '../lib/api.js';
import type { GithubInstallation, GitRepo, GitBranch as GitBranchType, DetectedBuild } from '@appk3s/shared';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GithubAppDeployConfig {
  installationId: string;          // UUID en DB
  installationNumericId: number;   // ID GitHub
  accountLogin: string;
  repo: GitRepo;
  branch: string;
  buildType: 'nixpacks' | 'dockerfile' | 'docker-compose' | 'static';
  // Advanced
  buildDir: string;
  dockerfilePath: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  publishDir: string;
  autoDeploy: boolean;
}

const BUILD_TYPE_META = {
  nixpacks: { icon: Zap, label: 'Nixpacks', desc: 'Détection automatique du langage' },
  dockerfile: { icon: FileCode2, label: 'Dockerfile', desc: 'Utilise le Dockerfile du dépôt' },
  'docker-compose': { icon: Package, label: 'Docker Compose', desc: 'Utilise docker-compose.yml' },
  static: { icon: LayoutTemplate, label: 'Site statique', desc: 'HTML/CSS/JS servi par nginx' },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-green-400',
  medium: 'text-yellow-400',
  low: 'text-slate-500',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepInstallation({
  installations,
  selected,
  onSelect,
  onInstall,
}: {
  installations: GithubInstallation[];
  selected: GithubInstallation | null;
  onSelect: (i: GithubInstallation) => void;
  onInstall: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Sélectionner un compte</h3>
        <p className="text-sm text-slate-400">Choisissez le compte GitHub où se trouve votre dépôt.</p>
      </div>

      {installations.length === 0 ? (
        <div className="card p-6 text-center space-y-3">
          <Github className="w-8 h-8 mx-auto text-slate-500" />
          <p className="text-slate-400 text-sm">Aucune installation GitHub App disponible.</p>
          <button onClick={onInstall} className="btn-primary text-sm mx-auto flex items-center gap-2">
            <Github className="w-4 h-4" /> Installer la GitHub App
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {installations.map((inst) => (
            <button
              key={inst.id}
              onClick={() => onSelect(inst)}
              className={`w-full card p-3 flex items-center gap-3 text-left transition-all ${
                selected?.id === inst.id
                  ? 'border-accent/60 bg-accent/5'
                  : 'hover:border-slate-600'
              }`}
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
                {inst.accountAvatarUrl
                  ? <img src={inst.accountAvatarUrl} alt={inst.accountLogin} className="w-full h-full object-cover" />
                  : <Github className="w-4 h-4 m-2 text-slate-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{inst.accountLogin}</p>
                <p className="text-xs text-slate-500">{inst.accountType} · {inst.repositorySelection === 'all' ? 'Tous les dépôts' : 'Dépôts sélectionnés'}</p>
              </div>
              {selected?.id === inst.id && <CheckCircle className="w-4 h-4 text-accent" />}
            </button>
          ))}
          <button
            onClick={onInstall}
            className="w-full card p-3 flex items-center gap-3 text-slate-400 hover:text-white hover:border-slate-600 text-sm"
          >
            <Plus className="w-4 h-4" />
            Ajouter un autre compte / organisation
          </button>
        </div>
      )}
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function StepRepo({
  installationId,
  selected,
  onSelect,
}: {
  installationId: string;
  selected: GitRepo | null;
  onSelect: (r: GitRepo) => void;
}) {
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    githubAppApi.listRepos(installationId)
      .then(setRepos)
      .catch(() => toast.error('Impossible de charger les dépôts'))
      .finally(() => setLoading(false));
  }, [installationId]);

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Sélectionner un dépôt</h3>
        <p className="text-sm text-slate-400">Choisissez le dépôt à déployer.</p>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-9"
          placeholder="Rechercher un dépôt…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {filtered.map((repo) => (
            <button
              key={repo.id}
              onClick={() => onSelect(repo)}
              className={`w-full card p-3 flex items-center gap-3 text-left transition-all ${
                selected?.id === repo.id
                  ? 'border-accent/60 bg-accent/5'
                  : 'hover:border-slate-600'
              }`}
            >
              {repo.private
                ? <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                : <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{repo.fullName}</p>
                {repo.description && (
                  <p className="text-xs text-slate-500 truncate">{repo.description}</p>
                )}
              </div>
              <span className="text-xs text-slate-600 flex-shrink-0">{repo.defaultBranch}</span>
              {selected?.id === repo.id && <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-4">Aucun dépôt trouvé</p>
          )}
        </div>
      )}
    </div>
  );
}

function StepBranch({
  installationId,
  repo,
  selected,
  onSelect,
}: {
  installationId: string;
  repo: GitRepo;
  selected: string;
  onSelect: (b: string) => void;
}) {
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    githubAppApi.listBranches(installationId, repo.fullName)
      .then(setBranches)
      .catch(() => toast.error('Impossible de charger les branches'))
      .finally(() => setLoading(false));
  }, [installationId, repo.fullName]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Sélectionner une branche</h3>
        <p className="text-sm text-slate-400">Branche à déployer sur {repo.fullName}.</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {branches.map((b) => (
            <button
              key={b.name}
              onClick={() => onSelect(b.name)}
              className={`w-full card p-3 flex items-center gap-3 text-left transition-all ${
                selected === b.name ? 'border-accent/60 bg-accent/5' : 'hover:border-slate-600'
              }`}
            >
              <GitBranch className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-white text-sm flex-1">{b.name}</span>
              {b.name === repo.defaultBranch && (
                <span className="text-xs text-slate-500">défaut</span>
              )}
              {selected === b.name && <CheckCircle className="w-4 h-4 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepBuildType({
  installationId,
  repo,
  branch,
  buildType,
  onSelect,
}: {
  installationId: string;
  repo: GitRepo;
  branch: string;
  buildType: string;
  onSelect: (bt: string) => void;
}) {
  const [detected, setDetected] = useState<DetectedBuild | null>(null);
  const [detecting, setDetecting] = useState(false);

  const detect = () => {
    setDetecting(true);
    githubAppApi.detectBuild(installationId, repo.fullName, branch)
      .then((d) => {
        setDetected(d);
        onSelect(d.buildType);
      })
      .catch(() => toast.error('Détection impossible'))
      .finally(() => setDetecting(false));
  };

  useEffect(() => { detect(); }, [installationId, repo.fullName, branch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Type de build</h3>
          <p className="text-sm text-slate-400">Comment votre application doit être construite.</p>
        </div>
        <button onClick={detect} disabled={detecting} className="btn-ghost p-2" title="Re-détecter">
          <RefreshCw className={`w-4 h-4 ${detecting ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {detected && (
        <div className={`text-xs px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 ${CONFIDENCE_COLOR[detected.confidence]}`}>
          Détecté : <strong>{detected.buildType}</strong>
          {detected.nixpacksLanguage && ` (${detected.nixpacksLanguage})`}
          {' '}— confiance : {detected.confidence}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(BUILD_TYPE_META) as [string, any][]).map(([key, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`card p-4 flex flex-col gap-2 text-left transition-all ${
                buildType === key
                  ? 'border-accent/60 bg-accent/5'
                  : 'hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-accent" />
                <span className="text-white text-sm font-medium">{meta.label}</span>
                {buildType === key && <CheckCircle className="w-3.5 h-3.5 text-accent ml-auto" />}
              </div>
              <p className="text-xs text-slate-500">{meta.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepAdvanced({
  config,
  onChange,
}: {
  config: Pick<GithubAppDeployConfig, 'buildDir' | 'dockerfilePath' | 'installCommand' | 'buildCommand' | 'startCommand' | 'publishDir' | 'autoDeploy'>;
  onChange: (key: string, value: string | boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Configuration avancée</h3>
        <p className="text-sm text-slate-400">Optionnel — laissez vide pour la détection automatique.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Répertoire de build</label>
          <input className="input" placeholder="/" value={config.buildDir} onChange={(e) => onChange('buildDir', e.target.value)} />
        </div>
        <div>
          <label className="label">Chemin Dockerfile</label>
          <input className="input" placeholder="Dockerfile" value={config.dockerfilePath} onChange={(e) => onChange('dockerfilePath', e.target.value)} />
        </div>
        <div>
          <label className="label">Commande d'installation</label>
          <input className="input font-mono text-sm" placeholder="npm install" value={config.installCommand} onChange={(e) => onChange('installCommand', e.target.value)} />
        </div>
        <div>
          <label className="label">Commande de build</label>
          <input className="input font-mono text-sm" placeholder="npm run build" value={config.buildCommand} onChange={(e) => onChange('buildCommand', e.target.value)} />
        </div>
        <div>
          <label className="label">Commande de démarrage</label>
          <input className="input font-mono text-sm" placeholder="npm start" value={config.startCommand} onChange={(e) => onChange('startCommand', e.target.value)} />
        </div>
        <div>
          <label className="label">Répertoire de publication (static)</label>
          <input className="input" placeholder="dist / build / public" value={config.publishDir} onChange={(e) => onChange('publishDir', e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all">
        <input
          type="checkbox"
          checked={config.autoDeploy}
          onChange={(e) => onChange('autoDeploy', e.target.checked)}
          className="w-4 h-4 rounded accent-accent"
        />
        <div>
          <p className="text-white text-sm font-medium">Déploiement automatique</p>
          <p className="text-xs text-slate-500">Redéployer à chaque push sur la branche sélectionnée</p>
        </div>
      </label>
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────────

interface Props {
  onCancel: () => void;
  appName: string;
  namespace?: string;
  projectId?: string;
}

export function DeployFromGithubApp({ onCancel, appName, namespace = 'default', projectId }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [installations, setInstallations] = useState<GithubInstallation[]>([]);
  const [loadingInst, setLoadingInst] = useState(true);

  // Selections
  const [selectedInst, setSelectedInst] = useState<GithubInstallation | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GitRepo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [buildType, setBuildType] = useState<'nixpacks' | 'dockerfile' | 'docker-compose' | 'static'>('nixpacks');
  const [advanced, setAdvanced] = useState({
    buildDir: '',
    dockerfilePath: '',
    installCommand: '',
    buildCommand: '',
    startCommand: '',
    publishDir: '',
    autoDeploy: true,
  });

  useEffect(() => {
    githubAppApi.listInstallations()
      .then(setInstallations)
      .finally(() => setLoadingInst(false));
  }, []);

  const handleInstall = async () => {
    try {
      const url = await githubAppApi.getInstallUrl();
      window.location.href = url;
    } catch {
      toast.error('GitHub App non configurée');
    }
  };

  const canNext = () => {
    if (step === 0) return !!selectedInst;
    if (step === 1) return !!selectedRepo;
    if (step === 2) return !!selectedBranch;
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedInst || !selectedRepo || !selectedBranch) return;
    setSubmitting(true);
    try {
      const payload = {
        name: appName,
        namespace,
        projectId,
        type: 'github-app' as const,
        githubInstallationId: selectedInst.id,
        githubRepoFullName: selectedRepo.fullName,
        gitRepoUrl: selectedRepo.url,
        gitBranch: selectedBranch,
        buildType,
        buildDir: advanced.buildDir || undefined,
        dockerfilePath: advanced.dockerfilePath || undefined,
        installCommand: advanced.installCommand || undefined,
        buildCommand: advanced.buildCommand || undefined,
        startCommand: advanced.startCommand || undefined,
        publishDir: advanced.publishDir || undefined,
        autoDeploy: advanced.autoDeploy,
        envVars: [],
        ports: [],
        volumes: [],
        ingressClass: 'traefik',
        tlsEnabled: false,
        replicas: 1,
        imageTag: 'latest',
      };

      const created = await appsApi.create(payload);
      toast.success('Application créée ! Déploiement en cours…');

      // Lancer le premier déploiement
      await appsApi.deploy(created.id);

      navigate(`/apps/${created.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Erreur');
      setSubmitting(false);
    }
  };

  const STEPS = ['Compte', 'Dépôt', 'Branche', 'Build', 'Avancé'];

  if (loadingInst) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <button
              onClick={() => i < step && setStep(i)}
              className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                i === step
                  ? 'bg-accent text-black'
                  : i < step
                  ? 'bg-green-500/20 text-green-400 cursor-pointer'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px w-8 ${i < step ? 'bg-green-500/40' : 'bg-slate-700'}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-slate-500">{STEPS[step]}</span>
      </div>

      {/* Step content */}
      <div className="min-h-[280px]">
        {step === 0 && (
          <StepInstallation
            installations={installations}
            selected={selectedInst}
            onSelect={(i) => { setSelectedInst(i); }}
            onInstall={handleInstall}
          />
        )}
        {step === 1 && selectedInst && (
          <StepRepo
            installationId={selectedInst.id}
            selected={selectedRepo}
            onSelect={(r) => {
              setSelectedRepo(r);
              setSelectedBranch(r.defaultBranch);
            }}
          />
        )}
        {step === 2 && selectedInst && selectedRepo && (
          <StepBranch
            installationId={selectedInst.id}
            repo={selectedRepo}
            selected={selectedBranch}
            onSelect={setSelectedBranch}
          />
        )}
        {step === 3 && selectedInst && selectedRepo && (
          <StepBuildType
            installationId={selectedInst.id}
            repo={selectedRepo}
            branch={selectedBranch}
            buildType={buildType}
            onSelect={(bt) => setBuildType(bt as any)}
          />
        )}
        {step === 4 && (
          <StepAdvanced
            config={advanced}
            onChange={(key, value) => setAdvanced((prev) => ({ ...prev, [key]: value }))}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-ghost text-sm">Annuler</button>
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="btn-ghost text-sm flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Précédent
            </button>
          )}
        </div>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            className="btn-primary text-sm flex items-center gap-2"
          >
            Suivant <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !canNext()}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
            Créer et déployer
          </button>
        )}
      </div>
    </div>
  );
}
