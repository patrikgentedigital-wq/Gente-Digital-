import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import './public.css';

export function StatusPage({ title, children, retry, digest }: {
  title: string;
  children: ReactNode;
  retry?: () => void;
  digest?: string;
}) {
  return (
    <div className="gd-public-site">
      <header className="pub-header">
        <Link href="/" aria-label="Gente Digital, página inicial"><BrandMark /></Link>
      </header>
      <main className="pub-status-main">
        <h1>{title}</h1>
        <p>{children}</p>
        <div className="pub-actions">
          {retry && <button type="button" className="pub-primary" onClick={retry}>Tentar novamente</button>}
          <Link href="/" className="pub-secondary">Ir para o início</Link>
        </div>
        {digest && <small>Código de rastreio <code>{digest}</code></small>}
      </main>
    </div>
  );
}
