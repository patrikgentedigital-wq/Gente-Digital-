import Image from 'next/image';

export function BrandMark({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <Image
      src="/gente-digital-vertical.svg"
      alt="Gente Digital"
      width={1367}
      height={594}
      unoptimized
      className={`brand-mark ${compact ? 'brand-mark--compact' : ''} ${className}`}
    />
  );
}
