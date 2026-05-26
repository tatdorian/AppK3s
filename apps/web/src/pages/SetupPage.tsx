import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import toast from 'react-hot-toast';

export function SetupPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (password.length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await authApi.register({ email, password });
      setAuth(token, user);
      toast.success('Compte administrateur créé — bienvenue !');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shadow-lg shadow-accent/30">
            <Server className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Bienvenue sur AppK3s</h1>
            <p className="text-slate-400 text-sm mt-1">
              Créez votre premier compte administrateur général
            </p>
          </div>
        </div>

        {/* Info card */}
        <div className="card p-4 mb-5 flex items-start gap-3">
          <Shield className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 space-y-1">
            <p className="text-white font-medium">Admin général</p>
            <p>Accès complet à toutes les ressources, projets, utilisateurs et paramètres du cluster.</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              className="input"
              placeholder="admin@monentreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="label">Mot de passe * <span className="text-slate-600">(8 caractères min)</span></label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Confirmer le mot de passe *</label>
            <input
              type={showPw ? 'text' : 'password'}
              className="input"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center py-2.5 mt-2"
            disabled={!email || !password || !confirm || loading}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Création en cours…</>
            ) : (
              <><Shield className="w-4 h-4" /> Créer le compte admin</>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-4">
          Ce formulaire disparaît une fois le premier compte créé.
        </p>
      </div>
    </div>
  );
}
