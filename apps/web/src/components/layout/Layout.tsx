import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { ProjectSwitcher } from './ProjectSwitcher.js';
import { useAuthStore } from '../../store/auth.js';
import { LogOut } from 'lucide-react';

export function Layout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-slate-700/50 bg-surface-100">
          <ProjectSwitcher />
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                  {user.email[0].toUpperCase()}
                </div>
                <span className="text-xs text-slate-400 hidden sm:block">{user.email}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  user.role === 'admin'
                    ? 'bg-accent/15 text-accent'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {user.role === 'admin' ? 'Admin' : 'Utilisateur'}
                </span>
              </div>
            )}
            <button
              onClick={logout}
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-all"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-surface">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
