import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/layout/Layout.js';
import { LoginPage } from './pages/LoginPage.js';
import { Dashboard } from './pages/Dashboard.js';
import { AppsPage } from './pages/AppsPage.js';
import { AppDetail } from './pages/AppDetail.js';
import { CreateApp } from './pages/CreateApp.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { useAuthStore } from './store/auth.js';
import { authApi } from './lib/api.js';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
