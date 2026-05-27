import { useState } from 'react';
import { Key, Eye, EyeOff, Copy, Check, X } from 'lucide-react';
import type { EnvVar } from '@appk3s/shared';

// ── Heuristics ────────────────────────────────────────────────────────────────
const SECRET_KWDS = ['password', 'pass', 'secret', 'token', 'apikey', 'api_key'];
const CRED_KWDS   = [...SECRET_KWDS, 'user', 'username', 'login', 'email', 'admin'];

function isSecretKey(key: string)     { const k = key.toLowerCase(); return SECRET_KWDS.some((w) => k.includes(w)); }
function isCredentialKey(key: string) { const k = key.toLowerCase(); return CRED_KWDS.some((w) => k.includes(w)); }

export function extractCredentials(vars: EnvVar[]) {
  return vars.filter((e) => isCredentialKey(e.key));
}

// ── Single row ────────────────────────────────────────────────────────────────
function CredentialRow({ k, v }: { k: string; v: string }) {
  const [show,   setShow]   = useState(false);
  const [copied, setCopied] = useState(false);
  const isSecret = isSecretKey(k);

  const copy = () => {
    navigator.clipboard.writeText(v).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* key */}
      <code className="text-xs text-slate-400 w-52 shrink-0 truncate">{k}</code>

      {/* value */}
      <code className={`text-xs font-mono flex-1 min-w-0 truncate px-2 py-0.5 rounded ${
        isSecret ? 'bg-slate-800 text-slate-300' : 'bg-slate-800 text-emerald-300'
      }`}>
        {isSecret && !show
          ? '••••••••'
          : v || <span className="italic text-slate-600">vide</span>}
      </code>

      {/* toggle visibility */}
      {isSecret && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
          title={show ? 'Masquer' : 'Afficher'}
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* copy */}
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
        title="Copier"
      >
        {copied
          ? <Check className="w-3.5 h-3.5 text-emerald-400" />
          : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
interface Props {
  envVars:     EnvVar[];
  dismissible?: boolean;
  onDismiss?:  () => void;
  /** Show "visible in Env Vars tab" note */
  withNote?:   boolean;
}

export function CredentialsPanel({ envVars, dismissible, onDismiss, withNote }: Props) {
  const creds = extractCredentials(envVars);
  if (creds.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold text-emerald-300">Identifiants de connexion</span>
        </div>
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {withNote && (
        <p className="text-xs text-slate-500 leading-relaxed">
          Notez ces identifiants avant de quitter cette page. Ils restent consultables
          dans l'onglet <strong className="text-slate-400">Env Vars</strong> à tout moment.
        </p>
      )}

      <div className="space-y-2">
        {creds.map((c) => (
          <CredentialRow key={c.key} k={c.key} v={c.value} />
        ))}
      </div>
    </div>
  );
}
