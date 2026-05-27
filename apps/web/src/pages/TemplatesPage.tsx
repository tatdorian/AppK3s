import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Rocket, X, ExternalLink, AlertCircle } from 'lucide-react';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '@appk3s/shared';
import type { AppTemplate } from '@appk3s/shared';
import { appsApi, settingsApi } from '../lib/api.js';
import toast from 'react-hot-toast';

// ── Deploy dialog ─────────────────────────────────────────────────────────────
function DeployDialog({
  template,
  wildcardDomain,
  onClose,
}: {
  template: AppTemplate;
  wildcardDomain: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState(template.id);
  const [subdomain, setSubdomain] = useState(template.id);
  const [tlsEnabled, setTlsEnabled] = useState(!!wildcardDomain);
  const [envVars, setEnvVars] = useState(
    template.defaults.envVars.map((e) => ({ ...e })),
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const app = await appsApi.create({
        ...template.defaults,
        name,
        namespace: 'default',
        subdomain,
        domain: wildcardDomain || undefined,
        tlsEnabled,
        templateId: template.id,
        envVars,
      });
      return appsApi.deploy(app.id).then(() => app);
    },
    onSuccess: (app) => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      toast.success(`${template.name} déployé !`);
      navigate(`/apps/${app.id}`);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Erreur de déploiement'),
  });

  const url = subdomain && wildcardDomain
    ? `${tlsEnabled ? 'https' : 'http'}://${subdomain}.${wildcardDomain}`
    : null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{template.icon}</span>
            <div>
              <h2 className="font-semibold text-white text-lg">{template.name}</h2>
              <p className="text-sm text-slate-400">{template.description}</p>
            </div>
          </div>
          <button
            className="text-slate-500 hover:text-slate-200 shrink-0"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* App name */}
        <div>
          <label className="label">Nom de l'application *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => {
              const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
              setName(v);
              setSubdomain(v);
            }}
            placeholder="mon-app"
          />
          <p className="text-xs text-slate-600 mt-1">Lettres minuscules, chiffres et tirets uniquement.</p>
        </div>

        {/* Subdomain */}
        {wildcardDomain ? (
          <div>
            <label className="label">Sous-domaine</label>
            <div className="flex items-center gap-1">
              <input
                className="input"
                value={subdomain}
                onChange={(e) =>
                  setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }
              />
              <span className="text-slate-400 text-sm shrink-0">.{wildcardDomain}</span>
            </div>
            {url && (
              <p className="text-xs text-accent mt-1 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {url}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-xs text-yellow-300">
              Aucun domaine wildcard configuré. Allez dans{' '}
              <a href="/settings" className="underline">Paramètres</a> pour en ajouter un.
            </p>
          </div>
        )}

        {/* TLS toggle */}
        {wildcardDomain && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tls"
              checked={tlsEnabled}
              onChange={(e) => setTlsEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            <label htmlFor="tls" className="text-sm text-slate-300">
              HTTPS (certificat wildcard)
            </label>
          </div>
        )}

        {/* Required env vars */}
        {envVars.length > 0 && (
          <div>
            <label className="label">Variables d'environnement</label>
            <div className="space-y-2">
              {envVars.map((ev, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input font-mono text-xs w-1/2"
                    value={ev.key}
                    readOnly
                  />
                  <input
                    className={`input font-mono text-xs flex-1 ${
                      template.requiredEnv?.includes(ev.key) ? 'border-yellow-500/40' : ''
                    }`}
                    value={ev.value}
                    placeholder={template.requiredEnv?.includes(ev.key) ? 'Requis' : ''}
                    onChange={(e) => {
                      const updated = [...envVars];
                      updated[i] = { ...updated[i], value: e.target.value };
                      setEnvVars(updated);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Docs link */}
        {template.docs && (
          <a
            href={template.docs}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-accent flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Documentation
          </a>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-700/40">
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            disabled={!name || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Déploiement…</>
            ) : (
              <><Rocket className="w-4 h-4" /> Déployer</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({
  template,
  onSelect,
}: {
  template: AppTemplate;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="card p-4 text-left hover:border-accent/40 hover:bg-surface-200/80 transition-all group flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{template.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white group-hover:text-accent transition-colors">
            {template.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{template.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-600 font-mono">
          {template.defaults.type === 'compose'
            ? '🐋 Stack multi-services'
            : `${template.defaults.image}:${template.defaults.imageTag}`}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-300 text-slate-400">
          {template.category}
        </span>
      </div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TemplatesPage() {
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AppTemplate | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const wildcardDomain = settings?.wildcardDomain ?? '';

  const filtered = TEMPLATES.filter((t) => {
    const matchCat = category === 'all' || t.category === category;
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Templates</h1>
        <p className="text-slate-400 text-sm mt-1">
          Déployez une application en un clic
          {wildcardDomain && (
            <span className="ml-1 text-accent">sur *.{wildcardDomain}</span>
          )}
        </p>
      </div>

      {/* No wildcard domain warning */}
      {!wildcardDomain && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
          <div>
            <p className="text-sm text-yellow-300 font-medium">Domaine wildcard non configuré</p>
            <p className="text-xs text-yellow-400/70 mt-0.5">
              Configurez un domaine wildcard dans{' '}
              <a href="/settings" className="underline">Paramètres → Wildcard & TLS</a>{' '}
              pour que les apps soient accessibles via HTTPS automatiquement.
            </p>
          </div>
        </div>
      )}

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="input flex-1"
          placeholder="Rechercher un template…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 flex-wrap">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                category === cat.id
                  ? 'bg-accent text-white'
                  : 'bg-surface-200 text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-12">Aucun template trouvé</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} onSelect={() => setSelected(t)} />
          ))}
        </div>
      )}

      {/* Deploy dialog */}
      {selected && (
        <DeployDialog
          template={selected}
          wildcardDomain={wildcardDomain}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
