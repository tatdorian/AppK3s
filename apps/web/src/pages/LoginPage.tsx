import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server } from 'lucide-react';
import { authApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import toast from 'react-hot-toast';

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user } = await authApi.login({ email, password });
      setAuth(token, user);
      navigate('/');
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
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">AppK3s</h1>
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
        </form>
      </div>
    </div>
  );
}
