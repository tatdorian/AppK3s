import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, Settings, Server, Network, Users, Shield,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.js';
import { cn } from '../../lib/utils.js';

// Navigation visible à tous les utilisateurs authentifiés
const baseNav = [
  { to: '/',     icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/apps', icon: Boxes,           label: 'Applications', end: false },
];

// Navigation réservée à l'admin général
const adminNav = [
  { to: '/nodes',    icon: Network, label: 'Nœuds' },
  { to: '/projects', icon: Shield,  label: 'Projets' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
  { to: '/users',    icon: Users,   label: 'Utilisateurs' },
];

function NavItem({ to, icon: Icon, label, end = false }: { to: string; icon: React.ElementType; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
          isActive
            ? 'bg-accent/15 text-accent'
            : 'text-slate-400 hover:text-slate-100 hover:bg-surface-200',
        )
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  return (
    <aside className="w-52 shrink-0 h-screen flex flex-col bg-surface-100 border-r border-slate-700/50">
      {/* Brand */}
      <div className="h-12 flex items-center gap-2.5 px-4 border-b border-slate-700/50">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <Server className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-white tracking-tight text-sm">AppK3s</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {baseNav.map(({ to, icon, label, end }) => (
          <NavItem key={to} to={to} icon={icon} label={label} end={end} />
        ))}

        {isAdmin && (
          <>
            <div className="my-2 border-t border-slate-700/30" />
            <p className="px-3 py-1 text-xs text-slate-600 uppercase tracking-wide font-medium">
              Administration
            </p>
            {adminNav.map(({ to, icon, label }) => (
              <NavItem key={to} to={to} icon={icon} label={label} />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
