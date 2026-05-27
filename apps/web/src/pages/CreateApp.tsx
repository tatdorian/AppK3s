import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ChevronLeft, Plus, Minus, FolderOpen, Lock, Search,
  ChevronDown, ChevronUp, ExternalLink, AlertTriangle, Rocket,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCreateApp } from '../hooks/useApps.js';
import { settingsApi, projectsApi, appsApi } from '../lib/api.js';
import { EnvVarsEditor } from '../components/EnvVarsEditor.js';
import { TEMPLATES, TEMPLATE_CATEGORIES, IMAGE_PORT_MAP } from '@appk3s/shared';
import type { AppTemplate, EnvVar, Port, Volume } from '@appk3s/shared';
import { CredentialsPanel } from '../components/CredentialsPanel.js';
import { useAuthStore } from '../store/auth.js';
import { useProjectStore } from '../store/project.js';

type AppType = 'docker-image' | 'compose' | 'github';
type Step = 'gallery' | 'form';

// ─── Category colours ─────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  stack:        'bg-violet-500/15 text-violet-400',
  web:          'bg-blue-500/15 text-blue-400',
  database:     'bg-orange-500/15 text-orange-400',
  storage:      'bg-purple-500/15 text-purple-400',
  monitoring:   'bg-yellow-500/15 text-yellow-400',
  devops:       'bg-cyan-500/15 text-cyan-400',
  productivity: 'bg-emerald-500/15 text-emerald-400',
  media:        'bg-pink-500/15 text-pink-400',
  auth:         'bg-red-500/15 text-red-400',
};
const CAT_LABELS: Record<string, string> = {
  stack: 'Stack', web: 'Web', database: 'Base de données', storage: 'Stockage',
  monitoring: 'Monitoring', devops: 'DevOps', productivity: 'Productivité',
  media: 'Médias', auth: 'Authentification',
};

// ─── Custom pseudo-templates ──────────────────────────────────────────────────
const CUSTOM_CARDS = [
  {
    id: '__docker-image',
    name: 'Image Docker',
    description: 'Déployer n\'importe quelle image Docker Hub ou registre privé.',
    icon: '🐳',
    category: null,
  },
  {
    id: '__compose',
    name: 'Docker Compose',
    description: 'Coller un fichier docker-compose.yml multi-services.',
    icon: '📄',
    category: null,
  },
  {
    id: '__github',
    name: 'GitHub',
    description: 'Récupérer un docker-compose.yml depuis un dépôt GitHub public ou privé.',
    icon: '🐙',
    category: null,
  },
];

// ─── Template card ────────────────────────────────────────────────────────────
function TemplateCard({
  icon, name, description, category, docs, onSelect,
}: {
  icon: string;
  name: string;
  description: string;
  category: string | null;
  docs?: string;
  onSelect: () => void;
}) {
  return (
    <div
      className="card p-5 flex flex-col gap-3 hover:border-slate-600/60 transition-all cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-3xl leading-none">{icon}</span>
        {docs && (
          <a
            href={docs}
            target="_blank"
            rel="noreferrer"
            className="text-slate-600 hover:text-slate-400 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      <div>
        <p className="font-semibold text-white text-sm group-hover:text-accent transition-colors">{name}</p>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{description}</p>
      </div>
      {category && (
        <span className={`text-xs px-2 py-0.5 rounded-full w-fit font-medium ${CAT_COLORS[category] ?? 'bg-slate-700 text-slate-400'}`}>
          {CAT_LABELS[category] ?? category}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CreateApp() {
  const navigate = useNavigate();
  const createMut = useCreateApp();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { currentProjectId: storeProjectId } = useProjectStore();

  // ── Step & template selection ──────────────────────────────────────────────
  // If ?template=<id> is in the URL, start directly on the form step
  const templateIdFromUrl = searchParams.get('template');
  const [step, setStep]       = useState<Step>(templateIdFromUrl ? 'form' : 'gallery');
  const [search, setSearch]   = useState('');
  const [category, setCategory] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<AppTemplate | null>(null);

  // ── Form state ─────────────────────────────────────────────────────────────
  const preselectedProjectId = searchParams.get('projectId') ?? storeProjectId ?? '';
  const [projectId, setProjectId] = useState<string>(preselectedProjectId);
  const [type, setType]           = useState<AppType>('docker-image');
  const [name, setName]           = useState('');
  const [namespace, setNamespace] = useState('default');
  const [image, setImage]         = useState('');
  const [imageTag, setImageTag]   = useState('latest');
  const [composeContent, setComposeContent] = useState('');
  // GitHub source state
  const [githubUrl, setGithubUrl]                   = useState('');
  const [githubToken, setGithubToken]               = useState('');
  const [githubUsername, setGithubUsername]         = useState('');
  const [githubBranch, setGithubBranch]             = useState('main');
  const [githubComposePath, setGithubComposePath]   = useState('docker-compose.yml');
  const [githubIsPrivate, setGithubIsPrivate]       = useState(false);
  const [envVars, setEnvVars]     = useState<EnvVar[]>([]);
  const [ports, setPorts]         = useState<Port[]>([]);
  const [volumes, setVolumes]     = useState<Volume[]>([]);
  const [subdomain, setSubdomain] = useState('');
  const [domain, setDomain]       = useState('');
  const [ingressClass, setIngressClass] = useState('traefik');
  const [tlsEnabled, setTlsEnabled]     = useState(false);
  const [replicas, setReplicas]   = useState(1);
  const [cpuLimit, setCpuLimit]   = useState('');
  const [memoryLimit, setMemoryLimit] = useState('');
  // Container CMD override (array of args for images that need explicit commands e.g. MinIO)
  const [args, setArgs]           = useState<string[]>([]);
  const [autoDeploy, setAutoDeploy]   = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list });

  const { data: myRoleData } = useQuery({
    queryKey: ['projects', projectId, 'my-role'],
    queryFn: () => projectsApi.getMyRole(projectId),
    enabled: !isAdmin && !!projectId,
  });
  const canSetDomain = isAdmin || myRoleData?.role === 'owner' || !projectId;

  // Pre-fill domain from global settings
  useEffect(() => {
    if (!settings) return;
    if (!domain && settings.defaultDomain) setDomain(settings.defaultDomain);
    if (settings.defaultIngressClass) setIngressClass(settings.defaultIngressClass);
    if (settings.defaultTls === 'true') setTlsEnabled(true);
  }, [settings]);

  // ── Apply template ─────────────────────────────────────────────────────────
  const applyTemplate = (tpl: AppTemplate | null, customType?: AppType) => {
    if (!tpl) {
      // Custom card
      setSelectedTemplate(null);
      setType(customType ?? 'docker-image');
      setImage(''); setImageTag('latest'); setComposeContent('');
      setGithubUrl(''); setGithubToken(''); setGithubUsername('');
      setGithubBranch('main'); setGithubComposePath('docker-compose.yml');
      setGithubIsPrivate(false);
      setEnvVars([]); setPorts([]); setVolumes([]);
      setName(''); setReplicas(1); setArgs([]);
    } else {
      setSelectedTemplate(tpl);
      setType(tpl.defaults.type);
      setImage(tpl.defaults.image ?? '');
      setImageTag(tpl.defaults.imageTag ?? 'latest');
      setPorts([...tpl.defaults.ports]);
      setVolumes([...(tpl.defaults.volumes ?? [])]);
      setEnvVars([...(tpl.defaults.envVars ?? [])]);
      setReplicas(tpl.defaults.replicas ?? 1);
      setIngressClass(tpl.defaults.ingressClass ?? 'traefik');
      setName(tpl.id);
      setComposeContent((tpl.defaults as any).composeContent ?? '');
      setArgs([...(tpl.defaults.args ?? [])]);
    }
    setStep('form');
  };

  // ── Auto-apply template from ?template=<id> URL param ─────────────────────
  // Runs once on mount — applyTemplate is stable (only calls state setters)
  useEffect(() => {
    if (!templateIdFromUrl) return;
    const tpl = TEMPLATES.find((t) => t.id === templateIdFromUrl);
    if (tpl) applyTemplate(tpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty: run once on mount

  // ── Filtered templates ─────────────────────────────────────────────────────
  const filtered = TEMPLATES.filter((t) => {
    const matchCat = category === 'all' || t.category === category;
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  // ── Required env vars ──────────────────────────────────────────────────────
  const requiredKeys = selectedTemplate?.requiredEnv ?? [];
  const requiredEnvVars = envVars.filter((e) => requiredKeys.includes(e.key));
  const optionalEnvVars = envVars.filter((e) => !requiredKeys.includes(e.key));
  const updateEnvVar = (idx: number, field: keyof EnvVar, val: string) => {
    setEnvVars((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  };

  // ── Image blur → auto-fill port ────────────────────────────────────────────
  const handleImageBlur = () => {
    if (ports.length > 0) return;
    const base = image.split(':')[0];
    const match = TEMPLATES.find((t) => t.defaults.image === base || t.defaults.image === image);
    if (match?.defaults.ports.length) { setPorts([...match.defaults.ports]); return; }
    const port = IMAGE_PORT_MAP[base] ?? IMAGE_PORT_MAP[image];
    if (port) setPorts([{ containerPort: port, protocol: 'TCP' }]);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const app = await createMut.mutateAsync({
      name, namespace, type,
      image: type === 'docker-image' ? image : undefined,
      imageTag,
      composeContent: type === 'compose' ? composeContent : undefined,
      // GitHub fields
      githubUrl: type === 'github' ? githubUrl : undefined,
      githubToken: type === 'github' && githubIsPrivate && githubToken ? githubToken : undefined,
      githubUsername: type === 'github' && githubIsPrivate && githubUsername ? githubUsername : undefined,
      githubBranch: type === 'github' ? (githubBranch || 'main') : undefined,
      githubComposePath: type === 'github' ? (githubComposePath || 'docker-compose.yml') : undefined,
      envVars, ports, volumes,
      subdomain: subdomain || undefined,
      domain: domain || undefined,
      ingressClass, tlsEnabled, replicas,
      cpuLimit: cpuLimit || undefined,
      memoryLimit: memoryLimit || undefined,
      projectId: projectId || undefined,
      args: args.length > 0 ? args : undefined,
    });

    if (autoDeploy) {
      await appsApi.deploy(app.id).catch(() => {});
    }
    navigate(`/apps/${app.id}?created=1`);
  };

  const backLink = preselectedProjectId ? `/projects/${preselectedProjectId}` : '/apps';

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1 — GALLERY
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'gallery') {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link to={backLink} className="btn-ghost p-2">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Nouvelle application</h1>
            <p className="text-slate-400 text-sm">Choisir un template ou partir de zéro</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-full"
            placeholder="Rechercher un template (nginx, postgres, wordpress…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 flex-wrap mb-6">
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                category === c.id
                  ? 'bg-accent text-white shadow'
                  : 'bg-surface-200 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Custom cards — always on top */}
        {category === 'all' && !search && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Personnalisé</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {CUSTOM_CARDS.map((c) => (
                <TemplateCard
                  key={c.id}
                  icon={c.icon}
                  name={c.name}
                  description={c.description}
                  category={c.category}
                  onSelect={() => applyTemplate(null, c.id === '__compose' ? 'compose' : c.id === '__github' ? 'github' : 'docker-image')}
                />
              ))}
            </div>
          </div>
        )}

        {/* Template grid */}
        {filtered.length === 0 ? (
          <div className="card p-12 text-center text-slate-500">
            <Search className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p>Aucun template ne correspond à "{search}"</p>
          </div>
        ) : (
          <>
            {(category !== 'all' || search) && (
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
              </p>
            )}
            {category === 'all' && !search ? (
              // Group by category
              TEMPLATE_CATEGORIES.slice(1).map((cat) => {
                const inCat = filtered.filter((t) => t.category === cat.id);
                if (!inCat.length) return null;
                return (
                  <div key={cat.id} className="mb-6">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{cat.label}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {inCat.map((t) => (
                        <TemplateCard
                          key={t.id}
                          icon={t.icon}
                          name={t.name}
                          description={t.description}
                          category={t.category}
                          docs={t.docs}
                          onSelect={() => applyTemplate(t)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filtered.map((t) => (
                  <TemplateCard
                    key={t.id}
                    icon={t.icon}
                    name={t.name}
                    description={t.description}
                    category={t.category}
                    docs={t.docs}
                    onSelect={() => applyTemplate(t)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2 — FORM
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button className="btn-ghost p-2" onClick={() => setStep('gallery')}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {selectedTemplate ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none">{selectedTemplate.icon}</span>
            <div>
              <h1 className="text-2xl font-bold text-white">{selectedTemplate.name}</h1>
              <p className="text-slate-400 text-sm">{selectedTemplate.description}</p>
            </div>
            {selectedTemplate.docs && (
              <a href={selectedTemplate.docs} target="_blank" rel="noreferrer" className="btn-ghost p-2 ml-1">
                <ExternalLink className="w-4 h-4 text-slate-500" />
              </a>
            )}
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-white">
              {type === 'compose' ? '📄 Docker Compose' : type === 'github' ? '🐙 GitHub' : '🐳 Image Docker'}
            </h1>
            <p className="text-slate-400 text-sm">Configuration personnalisée</p>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="space-y-5">

        {/* ── Général ─────────────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Général</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nom de l'application *</label>
              <input
                className="input"
                placeholder="my-app"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
              />
              <p className="text-xs text-slate-600 mt-1">minuscules et tirets uniquement</p>
            </div>
            <div>
              <label className="label">
                <FolderOpen className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
                Projet
              </label>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Default (aucun projet)</option>
                {(projects as any[]).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Image / Compose / GitHub source */}
          {!selectedTemplate && (
            <div>
              {type === 'docker-image' ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="label">Image Docker *</label>
                    <input
                      className="input"
                      placeholder="nginx"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      onBlur={handleImageBlur}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Tag</label>
                    <input
                      className="input"
                      placeholder="latest"
                      value={imageTag}
                      onChange={(e) => setImageTag(e.target.value)}
                    />
                  </div>
                </div>
              ) : type === 'compose' ? (
                <div>
                  <label className="label">docker-compose.yml *</label>
                  <textarea
                    className="input font-mono text-xs h-48 resize-none"
                    placeholder={'version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "80:80"'}
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    required
                  />
                </div>
              ) : (
                /* ── GitHub source ── */
                <div className="space-y-3">
                  {/* Security warning */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Le token d'accès sera stocké en clair dans la base de données.
                      Utilisez un token PAT avec des permissions minimales (lecture seule sur le dépôt).
                    </span>
                  </div>

                  {/* Repo URL */}
                  <div>
                    <label className="label">URL du dépôt GitHub *</label>
                    <input
                      className="input"
                      placeholder="https://github.com/utilisateur/mon-repo"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      required
                    />
                    <p className="text-xs text-slate-600 mt-1">
                      Formats acceptés : https://github.com/user/repo ou github.com/user/repo
                    </p>
                  </div>

                  {/* Public / Private toggle */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setGithubIsPrivate(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        !githubIsPrivate ? 'bg-accent text-white' : 'bg-surface-300 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🌐 Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setGithubIsPrivate(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        githubIsPrivate ? 'bg-accent text-white' : 'bg-surface-300 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🔒 Privé
                    </button>
                  </div>

                  {/* Private credentials */}
                  {githubIsPrivate && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Nom d'utilisateur GitHub</label>
                        <input
                          className="input"
                          placeholder="monlogin"
                          value={githubUsername}
                          onChange={(e) => setGithubUsername(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label">Token d'accès (PAT classique)</label>
                        <input
                          className="input"
                          type="password"
                          placeholder="ghp_xxxxxxxxxxxx"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Branch + compose path */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Branche</label>
                      <input
                        className="input"
                        placeholder="main"
                        value={githubBranch}
                        onChange={(e) => setGithubBranch(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Chemin du fichier compose</label>
                      <input
                        className="input"
                        placeholder="docker-compose.yml"
                        value={githubComposePath}
                        onChange={(e) => setGithubComposePath(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Template: show image/tag readonly */}
          {selectedTemplate && type === 'docker-image' && (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="label">Image</label>
                <div className="input bg-surface-200/50 text-slate-400 font-mono text-sm flex items-center">
                  {image}
                </div>
              </div>
              <div>
                <label className="label">Tag</label>
                <input
                  className="input"
                  value={imageTag}
                  onChange={(e) => setImageTag(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Variables requises ───────────────────────────────────────────── */}
        {requiredEnvVars.length > 0 && (
          <div className="card p-5 space-y-3 border-yellow-500/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
              <h2 className="text-sm font-semibold text-yellow-300">Variables requises</h2>
            </div>
            <p className="text-xs text-slate-500">Ces variables doivent être configurées avant le déploiement.</p>
            <div className="space-y-2">
              {requiredEnvVars.map((ev, i) => {
                const realIdx = envVars.findIndex((e) => e.key === ev.key);
                return (
                  <div key={ev.key} className="grid grid-cols-2 gap-2">
                    <div className="input bg-yellow-500/5 border-yellow-500/20 text-yellow-300 text-xs font-mono flex items-center">
                      {ev.key}
                    </div>
                    <input
                      className="input border-yellow-500/20 text-xs"
                      type={ev.key.toLowerCase().includes('password') || ev.key.toLowerCase().includes('secret') ? 'password' : 'text'}
                      placeholder={`Valeur pour ${ev.key}`}
                      value={ev.value}
                      onChange={(e) => updateEnvVar(realIdx, 'value', e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Variables d'environnement ────────────────────────────────────── */}
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Variables d'environnement</h2>
          <EnvVarsEditor
            value={selectedTemplate ? optionalEnvVars : envVars}
            onChange={(vars) => {
              if (selectedTemplate) {
                setEnvVars([...requiredEnvVars, ...vars]);
              } else {
                setEnvVars(vars);
              }
            }}
          />
        </div>

        {/* ── Domaine & Ingress ────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Domaine & Ingress</h2>
            {!canSetDomain && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Lock className="w-3 h-3" /> Réservé aux admins projet
              </span>
            )}
          </div>
          {!canSetDomain ? (
            <p className="text-xs text-slate-500 italic">
              Le domaine sera assigné automatiquement par l'administrateur du projet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Sous-domaine</label>
                  <input
                    className="input"
                    placeholder={name || 'my-app'}
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Domaine wildcard</label>
                  <input
                    className="input"
                    placeholder="example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                </div>
              </div>
              {subdomain && domain && (
                <p className="text-xs text-accent">
                  → URL : {tlsEnabled ? 'https' : 'http'}://{subdomain}.{domain}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Ingress Class</label>
                  <select
                    className="input"
                    value={ingressClass}
                    onChange={(e) => setIngressClass(e.target.value)}
                  >
                    <option value="traefik">Traefik (k3s default)</option>
                    <option value="nginx">nginx</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="tls"
                    checked={tlsEnabled}
                    onChange={(e) => setTlsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded accent-accent"
                  />
                  <label htmlFor="tls" className="text-sm text-slate-300">Activer TLS (HTTPS)</label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Configuration avancée (collapsible) ─────────────────────────── */}
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-300 hover:text-white hover:bg-surface-200/30 transition-colors"
          >
            <span>Configuration avancée</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 space-y-5 border-t border-slate-700/40 pt-4">
              {/* Namespace */}
              <div>
                <label className="label">Namespace Kubernetes</label>
                <input
                  className="input"
                  placeholder="default"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                />
              </div>

              {/* Ports */}
              {type === 'docker-image' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">Ports exposés</label>
                    <button
                      type="button"
                      onClick={() => setPorts([...ports, { containerPort: 80, protocol: 'TCP' }])}
                      className="btn-ghost text-xs py-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Ajouter
                    </button>
                  </div>
                  {ports.length === 0 && (
                    <p className="text-xs text-slate-600">Aucun port — le port 80 sera utilisé par défaut.</p>
                  )}
                  {ports.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="number"
                        className="input"
                        value={p.containerPort}
                        onChange={(e) => {
                          const next = [...ports];
                          next[i] = { ...next[i], containerPort: Number(e.target.value) };
                          setPorts(next);
                        }}
                      />
                      <select
                        className="input w-24 shrink-0"
                        value={p.protocol}
                        onChange={(e) => {
                          const next = [...ports];
                          next[i] = { ...next[i], protocol: e.target.value as 'TCP' | 'UDP' };
                          setPorts(next);
                        }}
                      >
                        <option>TCP</option>
                        <option>UDP</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setPorts(ports.filter((_, idx) => idx !== i))}
                        className="btn-danger p-2 shrink-0"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Volumes */}
              {type === 'docker-image' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">Volumes persistants</label>
                    <button
                      type="button"
                      onClick={() => setVolumes([...volumes, { name: `vol-${volumes.length}`, mountPath: '/data', size: '1Gi' }])}
                      className="btn-ghost text-xs py-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Ajouter
                    </button>
                  </div>
                  {volumes.map((v, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 items-center">
                      <input
                        className="input text-xs"
                        placeholder="nom-volume"
                        value={v.name}
                        onChange={(e) => {
                          const next = [...volumes];
                          next[i] = { ...next[i], name: e.target.value };
                          setVolumes(next);
                        }}
                      />
                      <input
                        className="input text-xs"
                        placeholder="/data"
                        value={v.mountPath}
                        onChange={(e) => {
                          const next = [...volumes];
                          next[i] = { ...next[i], mountPath: e.target.value };
                          setVolumes(next);
                        }}
                      />
                      <div className="flex gap-2">
                        <input
                          className="input text-xs"
                          placeholder="1Gi"
                          value={v.size}
                          onChange={(e) => {
                            const next = [...volumes];
                            next[i] = { ...next[i], size: e.target.value };
                            setVolumes(next);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setVolumes(volumes.filter((_, idx) => idx !== i))}
                          className="btn-danger p-2 shrink-0"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Resources */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Replicas</label>
                  <input
                    type="number"
                    className="input"
                    min={0} max={50}
                    value={replicas}
                    onChange={(e) => setReplicas(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">Limite CPU</label>
                  <input
                    className="input"
                    placeholder="500m"
                    value={cpuLimit}
                    onChange={(e) => setCpuLimit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Limite Mémoire</label>
                  <input
                    className="input"
                    placeholder="512Mi"
                    value={memoryLimit}
                    onChange={(e) => setMemoryLimit(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Identifiants configurés ─────────────────────────────────────── */}
        <CredentialsPanel envVars={envVars} />

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDeploy}
              onChange={(e) => setAutoDeploy(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            Déployer immédiatement
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep('gallery')} className="btn-ghost">
              Retour
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMut.isPending}
            >
              <Rocket className="w-4 h-4" />
              {createMut.isPending ? 'Création...' : 'Créer l\'application'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
