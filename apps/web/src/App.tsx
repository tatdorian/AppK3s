import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Layout } from './components/layout/Layout.js';
import { LoginPage } from './pages/LoginPage.js';
import { SetupPage } from './pages/SetupPage.js';
import { ChangePasswordPage } from './pages/ChangePasswordPage.js';
import { SetPasswordPage } from './pages/SetPasswordPage.js';
import { Dashboard } from './pages/Dashboard.js';
import { AppsPage } from './pages/AppsPage.js';
import { AppDetail } from './pages/AppDetail.js';
import { CreateApp } from './pages/CreateApp.js';
import { NodesPage } from './pages/NodesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { ProjectDetail } from './pages/ProjectDetail.js';
import { ApiKeysPage } from './pages/ApiKeysPage.js';
import { MonitoringPage } from './pages/MonitoringPage.js';
import { NotificationsPage } from './pages/NotificationsPage.js';
import { GitSourcesPage } from './pages/GitSourcesPage.js';
import { GithubAppPage } from './pages/GithubAppPage.js';
import { S3Page } from './pages/S3Page.js';
import { GithubAppInstalledPage } from './pages/GithubAppInstalledPage.js';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage.js';
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
  if (user.role !== 'admin' && user.role !== 'super-admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Blocks access to the main app if the user has mustChangePassword = true.
 * Redirects them to /change-password until they've set a new password.
 * If user is not yet loaded (null), we let it through — the loading state
 * will resolve before any sensitive content is shown.
 */
function RequirePasswordUpdated({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
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
        {/* GitHub App OAuth callback — stores token and redirects to / */}
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        {/* /setup inaccessible une fois le compte créé */}
        <Route path="/setup" element={<Navigate to="/login" replace />} />

        {/* Lien de création de mot de passe envoyé par email (public) */}
        <Route path="/setup-password" element={<SetPasswordPage />} />

        {/* Changement de mot de passe forcé (compte par défaut) */}
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />

        <Route
          element={
            <RequireAuth>
              {/* Bloque l'accès si mustChangePassword est true */}
              <RequirePasswordUpdated>
                <Layout />
              </RequirePasswordUpdated>
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="apps" element={<AppsPage />} />
          <Route path="apps/new" element={<CreateApp />} />
          <Route path="apps/:id" element={<AppDetail />} />

          {/* Available to all authenticated users */}
          <Route path="api-keys"       element={<ApiKeysPage />} />
          <Route path="s3"             element={<S3Page />} />
          <Route path="monitoring"     element={<MonitoringPage />} />
          <Route path="notifications"  element={<NotificationsPage />} />
          <Route path="git-sources"    element={<GitSourcesPage />} />
          <Route path="github-app"     element={<GithubAppPage />} />
          <Route path="github-app/installed" element={<GithubAppInstalledPage />} />

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
