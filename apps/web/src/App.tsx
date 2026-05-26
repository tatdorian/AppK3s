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

/** Vérifie le statut de setup au démarrage et redirige vers /setup si aucun user */
function SetupGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    authApi.setupStatus().then(({ setupRequired }) => {
      if (setupRequired) navigate('/setup', { replace: true });
      setChecked(true);
    }).catch(() => setChecked(true)); // Si l'API est down, on laisse passer
  }, []);

  if (!checked) return null;
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
