import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TigerBadge } from '../components/TigerLogo.js';
import { useAuthStore } from '../store/auth.js';
import toast from 'react-hot-toast';

// ─── Password strength ────────────────────────────────────────────────────────

function passwordStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const token = params.get('token') ?? '';

  // Token validation state
  const [checking, setChecking]   = useState(true);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Form state
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);

  // ── Validate token on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setTokenError('Lien invalide — aucun token fourni.');
      setChecking(false);
      return;
    }
    fetch(`/api/auth/setup-password/check?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setTokenError(data?.message ?? 'Token invalide ou expiré.');
        } else {
          setTokenEmail(data.email);
        }
      })
      .catch(() => setTokenError('Erreur réseau. Réessayez.'))
      .finally(() => setChecking(false));
  }, [token]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (passwordStrength(password) < 2) {
      toast.error('Mot de passe trop faible');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? 'Erreur lors de la définition du mot de passe');
        return;
      }
      setAuth(data.token, data.user);
      setDone(true);
      toast.success('Mot de passe défini — vous êtes connecté !');
      setTimeout(() => navigate('/'), 1500);
    } catch {
      toast.error('Erreur réseau. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  const strength = passwordStrength(password);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <TigerBadge size="lg" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">AK3s</h1>
            <p className="text-slate-400 text-sm mt-1">Définissez votre mot de passe</p>
          </div>
        </div>

        {/* Loading */}
        {checking && (
          <div className="card p-8 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <p className="text-sm">Vérification du lien…</p>
          </div>
        )}

        {/* Token error */}
        {!checking && tokenError && (
          <div className="card p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold">Lien invalide</p>
                <p className="text-slate-400 text-sm mt-1">{tokenError}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Ce lien n'est valable qu'une seule fois et expire après 7 jours.<br />
              Contactez votre administrateur pour obtenir un nouveau lien d'accès.
            </p>
          </div>
        )}

        {/* Success */}
        {done && (
          <div className="card p-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-white font-semibold">Mot de passe défini !</p>
            <p className="text-slate-400 text-sm">Redirection vers le tableau de bord…</p>
          </div>
        )}

        {/* Form */}
        {!checking && tokenEmail && !done && (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">

            <p className="text-sm text-slate-400">
              Compte : <span className="text-white font-medium">{tokenEmail}</span>
            </p>

            {/* Password */}
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

              {/* Strength indicator */}
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

            {/* Confirm */}
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
              disabled={!password || !confirm || password !== confirm || strength < 2 || submitting}
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enregistrement…</>
                : <><KeyRound className="w-4 h-4 mr-2" />Définir mon mot de passe</>
              }
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
