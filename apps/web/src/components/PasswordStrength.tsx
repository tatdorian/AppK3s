/**
 * PasswordStrength — indicateur de force + checklist des règles.
 * Utilisé dans CreateUserModal, UsersPage, SetupPage, ChangePasswordModal.
 */

interface Rule {
  label: string;
  ok: boolean;
}

function checkPassword(pw: string): { score: number; rules: Rule[] } {
  const rules: Rule[] = [
    { label: '8 caractères minimum',              ok: pw.length >= 8 },
    { label: 'Majuscule et minuscule',             ok: /[A-Z]/.test(pw) && /[a-z]/.test(pw) },
    { label: 'Chiffre ou caractère spécial',       ok: /[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw) },
  ];
  const bonus = pw.length >= 12 ? 1 : 0;
  const score = Math.min(rules.filter((r) => r.ok).length + bonus, 4) as 0 | 1 | 2 | 3 | 4;
  return { score, rules };
}

const STRENGTH_META = [
  { label: '',        bar: 'bg-slate-700' },
  { label: 'Faible',  bar: 'bg-red-500'     },
  { label: 'Moyen',   bar: 'bg-orange-500'  },
  { label: 'Bon',     bar: 'bg-yellow-500'  },
  { label: 'Fort',    bar: 'bg-emerald-500' },
];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, rules } = checkPassword(password);
  const meta = STRENGTH_META[score];

  return (
    <div className="mt-2 space-y-2">
      {/* Barre de force */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4].map((lvl) => (
          <div
            key={lvl}
            className={`h-1 flex-1 rounded-full transition-colors ${
              score >= lvl ? meta.bar : 'bg-slate-700'
            }`}
          />
        ))}
        <span className="text-xs text-slate-500 ml-1 w-10 shrink-0">{meta.label}</span>
      </div>

      {/* Checklist des règles */}
      <ul className="space-y-0.5">
        {rules.map((r) => (
          <li key={r.label} className={`text-xs flex items-center gap-1.5 ${r.ok ? 'text-emerald-400' : 'text-slate-500'}`}>
            <span className="w-3 shrink-0">{r.ok ? '✓' : '·'}</span>
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Retourne true si le mot de passe respecte toutes les règles */
export function isPasswordValid(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[A-Z]/.test(pw) && /[a-z]/.test(pw) &&
    (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw))
  );
}
