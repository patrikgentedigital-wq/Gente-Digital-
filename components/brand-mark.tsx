'use client';

import Image from 'next/image';

interface BrandMarkProps {
  compact?: boolean;
  showTagline?: boolean;
  showLogo?: boolean;
  /** onInk: para fundos escuros (padrão). onYellow: para a lateral amarela da marca. */
  tone?: 'onInk' | 'onYellow';
  className?: string;
}

/**
 * Wordmark used in the commercial PDF and throughout the authenticated app.
 * Keeping it in one component prevents small variations between the shell and
 * the mobile header while the canonical vector asset is being prepared.
 */
export function BrandMark({ compact = false, showTagline = false, showLogo = false, tone = 'onInk', className = '' }: BrandMarkProps) {
  const onYellow = tone === 'onYellow';

  return (
    <div className={`inline-flex flex-col ${className}`} aria-label="Gente Digital">
      {showLogo ? (
        <Image src="/logo-gente-digital.png" alt="" width={600} height={264} unoptimized
          className={compact ? 'h-auto w-[4.5rem]' : 'h-auto w-36'} />
      ) : (
        <span className={`font-display leading-none tracking-tight ${compact ? 'text-base' : 'text-[28px]'}`}>
          <span className={`font-extrabold ${onYellow ? 'text-[#0e1b2c]' : 'text-[#ffe300]'}`}>Gente</span>
          <span className={`ml-1 font-medium ${onYellow ? 'text-[#0e1b2c]' : 'text-white'}`}>Digital</span>
        </span>
      )}
      {showTagline && (
        <span className={`mt-1.5 text-sm font-semibold ${onYellow ? 'text-[#0e1b2c]/75' : 'text-slate-400'}`}>
          Gestão de vendas
        </span>
      )}
    </div>
  );
}
