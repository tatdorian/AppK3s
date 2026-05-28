import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import { TigerBadge } from '../components/TigerLogo.js';
import toast from 'react-hot-toast';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  // Listen for the token posted by the GitHub OAuth popup
  const handleGithubLogin = () => {
    setGithubLoading(true);
    const popup = window.open(
      '/api/auth/github',
      'github-oauth',
      'width=600,height=700,scrollbars=yes,resizable=yes',
    );

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'oauth_success') return;
      window.removeEventListener('message', onMessage);
      setGithubLoading(false);
      const { token, user } = event.data;
      setAuth(token, user);
      if (user?.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate('/');
      }
    };

    window.addEventListener('message', onMessage);

    // Clean up if the popup is closed without completing
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', onMessage);
        setGithubLoading(false);
      }
    }, 500);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user } = await authApi.login({ email, password });
      setAuth(token, user);
      // Force password change if the default account is used
      if (user.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <TigerBadge size="md" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">AK3s</h1>
            <p className="text-sm text-slate-400 mt-0.5">Kubernetes deploy platform</p>
          </div>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="admin@appk3s.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full justify-center py-2.5 mt-2"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-white/10" />
            <span className="mx-3 text-xs text-slate-500">ou</span>
            <div className="flex-1 border-t border-white/10" />
          </div>

          <button
            type="button"
            onClick={handleGithubLogin}
            disabled={githubLoading}
            className="btn-secondary w-full justify-center py-2.5 flex items-center gap-2"
          >
            {githubLoading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            )}
            {githubLoading ? 'Authentification…' : 'Se connecter avec GitHub'}
          </button>

          {searchParams.get('error') && (
            <p className="text-red-400 text-xs text-center">
              {searchParams.get('error') === 'github_app_not_configured'
                ? 'GitHub App non configurée. Contactez un administrateur.'
                : 'Échec de l\'authentification GitHub. Veuillez réessayer.'}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
