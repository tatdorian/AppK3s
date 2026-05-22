import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Boxes, Settings, LogOut, Server, Network } from 'lucide-react';
import { useAuthStore } from '../../store/auth.js';
import { cn } from '../../lib/utils.js';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/apps', icon: Boxes, label: 'Applications' },
  { to: '/nodes', icon: Network, label: 'Nœuds' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="w-60 shrink-0 h-screen flex flex-col bg-surface-100 border-r border-slate-700/50">
      {/* Brand */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-700/50">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Server className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-white tracking-tight">AppK3s</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-surface-200',
              )
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-700/50">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/5 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
