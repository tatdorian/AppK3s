import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

// ─── Spinner plein écran ──────────────────────────────────────────────────────
function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { token, setAuth, logout } = useAuthStore();

  /**
   * null  = vérification en cours (spinner)
   * true  = aucun compte → montrer /setup en exclusif
   * false = au moins un compte → routes normales
   */
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    // Hydrate le user si déjà connecté
    if (token) {
      authApi.me().then((user) => setAuth(token, user)).catch(logout);
    }

    // Vérifie si le setup initial est nécessaire
    authApi.setupStatus()
      .then(({ setupRequired: req }) => setSetupRequired(req))
      .catch(() => setSetupRequired(false)); // API down → on suppose que c'est ok
  }, []);

  // ── Chargement initial ──────────────────────────────────────────────────────
  if (setupRequired === null) return <FullScreenSpinner />;

  // ── Premier lancement : aucun compte en base ────────────────────────────────
  // On affiche UNIQUEMENT la page de création du compte admin.
  // Toutes les autres URLs redirigent vers /setup.
  if (setupRequired) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="/setup"
            element={
              <SetupPage onComplete={() => setSetupRequired(false)} />
            }
          />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // ── Application normale (au moins un compte existe) ─────────────────────────
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* /setup inaccessible une fois le compte créé */}
        <Route path="/setup" element={<Navigate to="/login" replace />} />

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

          {/* Admin-only */}
          <Route path="nodes"          element={<RequireAdmin><NodesPage /></RequireAdmin>} />
          <Route path="settings"       element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
          <Route path="users"          element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          <Route path="projects"       element={<RequireAdmin><ProjectsPage /></RequireAdmin>} />
          <Route path="projects/:id"   element={<RequireAdmin><ProjectDetail /></RequireAdmin>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
