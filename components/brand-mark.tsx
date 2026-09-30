'use client';

interface BrandMarkProps {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
}

/**
 * Wordmark used in the commercial PDF and throughout the authenticated app.
 * Keeping it in one component prevents small variations between the shell and
 * the mobile header while the canonical vector asset is being prepared.
 */
export function BrandMark({ compact = false, showTagline = false, className = '' }: BrandMarkProps) {
  return (
    <div className={`inline-flex flex-col ${className}`} aria-label="Gente Digital">
      <span
        className={`font-display font-extrabold leading-none tracking-[0.025em] ${compact ? 'text-[10px]' : 'text-[18px]'}`}
      >
        <span className="text-[#ffe600]">GENTE</span>{' '}
        <span className="text-white">DIGITAL</span>
      </span>
      {showTagline && (
        <span className="mt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Gestão de vendas
        </span>
      )}
    </div>
  );
}
