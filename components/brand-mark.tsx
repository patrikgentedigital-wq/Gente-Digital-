'use client';

interface BrandMarkProps {
  compact?: boolean;
  showTagline?: boolean;
  /** onInk: para fundos escuros (padrão). onYellow: para a lateral amarela da marca. */
  tone?: 'onInk' | 'onYellow';
  className?: string;
}

/**
 * Wordmark used in the commercial PDF and throughout the authenticated app.
 * Keeping it in one component prevents small variations between the shell and
 * the mobile header while the canonical vector asset is being prepared.
 */
export function BrandMark({ compact = false, showTagline = false, tone = 'onInk', className = '' }: BrandMarkProps) {
  const onYellow = tone === 'onYellow';

  return (
    <div className={`inline-flex flex-col ${className}`} aria-label="Gente Digital">
      <span className={`font-display leading-none tracking-tight ${compact ? 'text-base' : 'text-[28px]'}`}>
        <span className={`font-extrabold ${onYellow ? 'text-[#0e1b2c]' : 'text-[#ffe300]'}`}>Gente</span>
        <span className={`ml-1 font-medium ${onYellow ? 'text-[#0e1b2c]' : 'text-white'}`}>Digital</span>
      </span>
      {showTagline && (
        <span className={`mt-1.5 text-sm font-semibold ${onYellow ? 'text-[#0e1b2c]/75' : 'text-slate-400'}`}>
          Gestão de vendas
        </span>
      )}
    </div>
  );
}
