import { useState } from 'react';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import { TigerBadge } from '../components/TigerLogo.js';
import toast from 'react-hot-toast';

interface Props {
  /** Appelé après création du compte — App.tsx bascule vers les routes normales */
  onComplete?: () => void;
}

export function SetupPage({ onComplete }: Props) {
  const { setAuth } = useAuthStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 8)  { toast.error('Mot de passe : 8 caractères minimum'); return; }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
      toast.error('Le mot de passe doit contenir au moins une majuscule et une minuscule');
      return;
    }
    if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
      toast.error('Le mot de passe doit contenir au moins un chiffre ou un caractère spécial');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await authApi.register({ email, password });
      setAuth(token, user);
      toast.success('Compte administrateur créé — bienvenue !');
      onComplete?.(); // App bascule vers les routes normales → / s'affiche
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">

        {/* Logo + titre */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <TigerBadge size="lg" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Bienvenue sur AK3s</h1>
            <p className="text-slate-400 text-sm mt-1">
              Première connexion — créez votre compte administrateur
            </p>
          </div>
        </div>

        {/* Bandeau info */}
        <div className="card p-4 mb-5 flex items-start gap-3 border-accent/30 bg-accent/5">
          <Shield className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-white font-medium text-sm">Administrateur général</p>
            <p className="text-slate-400 text-xs leading-relaxed mt-0.5">
              Ce compte aura accès à toutes les ressources, projets, utilisateurs
              et paramètres du cluster. Il pourra créer d'autres comptes.
            </p>
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={submit} className="card p-6 space-y-4">

          <div>
            <label className="label">Adresse email *</label>
            <input
              type="email"
              className="input"
              placeholder="admin@monentreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label">
              Mot de passe *{' '}
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
                      passwordStrength(password) >= lvl
                        ? lvl === 1 ? 'bg-red-500'
                        : lvl === 2 ? 'bg-orange-500'
                        : lvl === 3 ? 'bg-yellow-500'
                        : 'bg-emerald-500'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
                <span className="text-xs text-slate-500 ml-1 w-10 shrink-0">
                  {['', 'Faible', 'Moyen', 'Bon', 'Fort'][passwordStrength(password)]}
                </span>
              </div>
            )}
          </div>

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
            disabled={!email || !password || password !== confirm || loading}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Création en cours…</>
              : <><Shield className="w-4 h-4 mr-2" />Créer le compte administrateur</>
            }
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-4">
          Ce formulaire n'est accessible qu'une seule fois — lors du premier lancement.
        </p>
      </div>
    </div>
  );
}

function passwordStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4) as 1 | 2 | 3 | 4;
}
