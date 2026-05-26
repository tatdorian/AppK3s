import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FolderOpen, Layers, Plus, Check } from 'lucide-react';
import { projectsApi } from '../../lib/api.js';
import { useAuthStore } from '../../store/auth.js';
import { useProjectStore } from '../../store/project.js';
import { Link } from 'react-router-dom';
import type { Project } from '@appk3s/shared';

export function ProjectSwitcher() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { currentProjectId, setCurrentProject } = useProjectStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    enabled: !!user,
  });

  // Auto-select first project for non-admins who have exactly one project
  useEffect(() => {
    if (!isAdmin && currentProjectId === null && (projects as Project[]).length > 0) {
      setCurrentProject((projects as Project[])[0].id);
    }
  }, [projects, isAdmin, currentProjectId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentProject = (projects as Project[]).find((p) => p.id === currentProjectId);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-200 border border-slate-700/50 hover:border-slate-600 transition-colors text-sm text-white min-w-0 max-w-[220px]"
      >
        {currentProjectId === null ? (
          <>
            <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate font-medium">Tous les projets</span>
          </>
        ) : (
          <>
            <FolderOpen className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate font-medium">{currentProject?.name ?? 'Projet'}</span>
          </>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-64 card py-1.5 shadow-xl z-50 border border-slate-700/60">
          {/* Admin: "Tous les projets" option */}
          {isAdmin && (
            <button
              onClick={() => { setCurrentProject(null); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-200 transition-colors text-left"
            >
              <Layers className="w-4 h-4 text-accent shrink-0" />
              <span className="flex-1 text-slate-200">Tous les projets</span>
              {currentProjectId === null && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>
          )}

          {(projects as Project[]).length > 0 && (
            <>
              {isAdmin && <div className="border-t border-slate-700/40 my-1" />}
              <p className="px-3 py-1 text-xs text-slate-600 uppercase tracking-wide font-medium">
                Projets
              </p>
              {(projects as Project[]).map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setCurrentProject(p.id); setOpen(false); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-200 transition-colors text-left"
                >
                  <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 truncate">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-slate-600 truncate">{p.description}</p>
                    )}
                  </div>
                  {currentProjectId === p.id && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                </button>
              ))}
            </>
          )}

          {(projects as Project[]).length === 0 && !isAdmin && (
            <div className="px-3 py-3 text-xs text-slate-500 text-center">
              Aucun projet accessible
            </div>
          )}

          {isAdmin && (
            <>
              <div className="border-t border-slate-700/40 my-1" />
              <Link
                to="/projects"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-200 transition-colors text-slate-400 hover:text-accent"
              >
                <Plus className="w-4 h-4" />
                Gérer les projets
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
