import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Layout } from './components/layout/Layout.js';
import { LoginPage } from './pages/LoginPage.js';
import { SetupPage } from './pages/SetupPage.js';
import { Dashboard } from './pages/Dashboard.js';
import { AppsPage } from './pages/AppsPage.js';
import { AppDetail } from './pages/AppDetail.js';
import { CreateApp } from './pages/CreateApp.js';
import { NodesPage } from './pages/NodesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { ProjectDetail } from './pages/ProjectDetail.js';
import { useAuthStore } from './store/auth.js';
import { authApi } from './lib/api.js';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Vérifie au démarrage si aucun utilisateur n'existe.
 * - Aucun user → redirige vers /setup (création du compte admin)
 * - Au moins un user → laisse passer vers /login ou l'app normalement
 * - Si déjà connecté et setup déjà fait → laisse passer directement
 */
function SetupGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Si déjà authentifié, inutile de vérifier
    if (isAuthenticated()) { setChecked(true); return; }

    authApi.setupStatus()
      .then(({ setupRequired }) => {
        if (setupRequired) navigate('/setup', { replace: true });
        setChecked(true);
      })
      .catch(() => setChecked(true)); // API down → on laisse passer, login affichera l'erreur
  }, []);

  // Spinner centré pendant la vérification (évite la page blanche)
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const { token, setAuth, logout } = useAuthStore();

  // Hydrate user info on load
  useEffect(() => {
    if (!token) return;
    authApi.me().then((user) => setAuth(token, user)).catch(logout);
  }, []);

  return (
    <BrowserRouter>
      <SetupGate>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="apps/new" element={<CreateApp />} />
            <Route path="apps/:id" element={<AppDetail />} />

            {/* Admin-only routes */}
            <Route path="nodes" element={<RequireAdmin><NodesPage /></RequireAdmin>} />
            <Route path="settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
            <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
            <Route path="projects" element={<RequireAdmin><ProjectsPage /></RequireAdmin>} />
            <Route path="projects/:id" element={<RequireAdmin><ProjectDetail /></RequireAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SetupGate>
    </BrowserRouter>
  );
}
