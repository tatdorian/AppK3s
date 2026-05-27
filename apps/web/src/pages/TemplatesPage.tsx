import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink, Rocket } from 'lucide-react';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '@appk3s/shared';
import type { AppTemplate } from '@appk3s/shared';

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
        <span className="text-xs text-slate-600 font-mono truncate max-w-[70%]">
          {template.defaults.type === 'compose'
            ? '🐋 Stack multi-services'
            : `${template.defaults.image}:${template.defaults.imageTag}`}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-300 text-slate-400 shrink-0">
          {template.category}
        </span>
      </div>
      {template.docs && (
        <a
          href={template.docs}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-slate-600 hover:text-accent flex items-center gap-1 w-fit"
        >
          <ExternalLink className="w-3 h-3" /> Documentation
        </a>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TemplatesPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Clicking a template redirects to the full CreateApp form pre-filled with
  // that template — exactly the same flow as deploying via a custom image.
  const handleSelect = (template: AppTemplate) => {
    navigate(`/apps/new?template=${template.id}`);
  };

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
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Rocket className="w-6 h-6 text-accent" />
          Templates
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Choisissez un template — le formulaire sera pré-rempli, modifiable avant déploiement.
        </p>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-full"
            placeholder="Rechercher un template…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
            <TemplateCard key={t.id} template={t} onSelect={() => handleSelect(t)} />
          ))}
        </div>
      )}
    </div>
  );
}
