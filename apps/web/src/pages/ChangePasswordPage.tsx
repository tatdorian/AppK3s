import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader2, AlertTriangle, KeyRound } from 'lucide-react';
import { usersApi, authApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import toast from 'react-hot-toast';

function passwordStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, token, setAuth } = useAuthStore();

  const [email, setEmail]         = useState(user?.email ?? '');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);

  if (!user) return null;

  const strength = passwordStrength(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 8)  { toast.error('Mot de passe : 8 caractères minimum'); return; }
    if (strength < 2)         { toast.error('Mot de passe trop faible'); return; }

    setLoading(true);
    try {
      await usersApi.update(user.id, { email: email !== user.email ? email : undefined, password });
      // Re-fetch /me to get updated user (mustChangePassword now false)
      const updated = await authApi.me();
      setAuth(token!, updated);
      toast.success('Mot de passe mis à jour — bienvenue !');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors du changement de mot de passe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">

        {/* Icon + titre */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-yellow-400" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Changement de mot de passe requis</h1>
            <p className="text-slate-400 text-sm mt-1">
              Vous utilisez le compte par défaut — choisissez un mot de passe personnel.
            </p>
          </div>
        </div>

        {/* Bandeau d'alerte */}
        <div className="card p-4 mb-5 flex items-start gap-3 border-yellow-500/30 bg-yellow-500/5">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-300 font-medium text-sm">Compte par défaut détecté</p>
            <p className="text-slate-400 text-xs leading-relaxed mt-0.5">
              Le compte <span className="font-mono text-slate-300">{user.email}</span> utilise les
              identifiants d'installation par défaut. Vous devez définir un nouveau mot de passe
              avant de continuer.
            </p>
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={submit} className="card p-6 space-y-4">

          {/* Adresse email */}
          <div>
            <label className="label">
              Adresse email *{' '}
              <span className="text-slate-600 font-normal">modifiable si vous le souhaitez</span>
            </label>
            <input
              type="email"
              className="input"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {/* Nouveau mot de passe */}
          <div>
            <label className="label">
              Nouveau mot de passe *{' '}
              <span className="text-slate-600 font-normal">8 caractères min.</span>
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Indicateur de force */}
            {password.length > 0 && (
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4].map((lvl) => (
                  <div
                    key={lvl}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      strength >= lvl
                        ? lvl === 1 ? 'bg-red-500'
                        : lvl === 2 ? 'bg-orange-500'
                        : lvl === 3 ? 'bg-yellow-500'
                        : 'bg-emerald-500'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
                <span className="text-xs text-slate-500 ml-1 w-10 shrink-0">
                  {['', 'Faible', 'Moyen', 'Bon', 'Fort'][strength]}
                </span>
              </div>
            )}
          </div>

          {/* Confirmation */}
          <div>
            <label className="label">Confirmer le mot de passe *</label>
            <input
              type={showPw ? 'text' : 'password'}
              className={`input ${
                confirm && confirm !== password ? 'border-red-500/60 focus:border-red-500' : ''
              }`}
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
            {confirm && confirm !== password && (
              <p className="text-xs text-red-400 mt-1">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center py-3 mt-2 text-sm font-semibold"
            disabled={!password || password !== confirm || strength < 2 || loading}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Mise à jour…</>
              : <><Shield className="w-4 h-4 mr-2" />Définir mon mot de passe</>
            }
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-4">
          Ces identifiants seront utilisés pour toutes vos prochaines connexions.
        </p>
      </div>
    </div>
  );
}
