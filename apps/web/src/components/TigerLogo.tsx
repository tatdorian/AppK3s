/**
 * AK3s Tiger Logo — icône tigre stylisée
 * Inspirée du style Docker (animal mascotte minimaliste)
 */

interface TigerLogoProps {
  className?: string;
}

export function TigerIcon({ className }: TigerLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Tête principale — forme arrondie */}
      <path
        d="M16 3C10.48 3 6 7.26 6 12.5c0 3.8 2.15 7.12 5.33 8.85L10.5 27l5.5-2 5.5 2-.83-5.65C23.85 19.62 26 16.3 26 12.5 26 7.26 21.52 3 16 3z"
        fill="currentColor"
      />
      {/* Oreille gauche */}
      <path
        d="M7 9 L4 5 L8.5 8.5z"
        fill="currentColor"
      />
      {/* Oreille droite */}
      <path
        d="M25 9 L28 5 L23.5 8.5z"
        fill="currentColor"
      />
      {/* Stries de tigre — front gauche */}
      <path
        d="M11 7 C10.5 9 11.5 10.5 12 9.5"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Stries de tigre — front droit */}
      <path
        d="M21 7 C21.5 9 20.5 10.5 20 9.5"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Strie centrale */}
      <path
        d="M16 6 L16 9"
        stroke="white"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* Œil gauche */}
      <ellipse cx="12" cy="13.5" rx="1.8" ry="2" fill="white" opacity="0.95" />
      <ellipse cx="12" cy="13.5" rx="0.9" ry="1.2" fill="#0f172a" />
      {/* Œil droit */}
      <ellipse cx="20" cy="13.5" rx="1.8" ry="2" fill="white" opacity="0.95" />
      <ellipse cx="20" cy="13.5" rx="0.9" ry="1.2" fill="#0f172a" />
      {/* Nez */}
      <path
        d="M14.5 17.5 L16 19 L17.5 17.5"
        fill="white"
        opacity="0.75"
      />
      {/* Moustaches gauches */}
      <line x1="6" y1="16.5" x2="11.5" y2="17" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.3" />
      <line x1="6" y1="18.5" x2="11.5" y2="18" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.3" />
      {/* Moustaches droites */}
      <line x1="26" y1="16.5" x2="20.5" y2="17" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.3" />
      <line x1="26" y1="18.5" x2="20.5" y2="18" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

/**
 * Badge logo complet : fond coloré + icône tigre
 * Tailles : sm (sidebar), md (login), lg (setup)
 */
export function TigerBadge({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { outer: 'w-7 h-7 rounded-lg',     icon: 'w-4 h-4' },
    md: { outer: 'w-12 h-12 rounded-2xl',  icon: 'w-6 h-6' },
    lg: { outer: 'w-16 h-16 rounded-2xl',  icon: 'w-9 h-9' },
  };
  const { outer, icon } = sizes[size];

  return (
    <div
      className={`${outer} flex items-center justify-center shadow-lg`}
      style={{
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
        boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
      }}
    >
      <TigerIcon className={`${icon} text-white`} />
    </div>
  );
}
