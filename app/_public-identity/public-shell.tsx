import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { CableArt } from '@/components/cable-art';
import './public.css';

type PublicShellProps = {
  children: ReactNode;
  referral?: boolean;
  headerAction?: ReactNode;
  referrer?: ReactNode;
  details?: ReactNode;
};

export function PublicShell({ children, referral = false, headerAction, referrer, details }: PublicShellProps) {
  return (
    <div className="gd-public-site">
      <header className="pub-header">
        <Link href="/" aria-label="Gente Digital, página inicial"><BrandMark /></Link>
        {headerAction}
      </header>
      <main className="pub-main">
        <div className="pub-grid">
          <section className="pub-board">
            <div className="pub-pitch">
              <h1>{referral ? <>Quem indica<br /><em>também ganha.</em></> : 'Área da equipe'}</h1>
              <p>{referral
                ? 'Clientes ganham desconto na mensalidade. Colaboradores recebem via Pix por venda instalada.'
                : 'Acompanhe suas indicações, vendas e comissões em um só lugar.'}</p>
            </div>
            {referrer}
            <div className="pub-cable"><CableArt /></div>
            <div className="pub-board-end">
              <span>Programa de indicação</span>
              <Link href={referral ? '/login' : '/indicar'}>{referral ? 'Acesso ao painel' : 'Conhecer o programa'} <ArrowUpRight size={16} /></Link>
            </div>
          </section>
          <section className="pub-form-region">
            <div className="pub-form">{children}</div>
          </section>
        </div>
        {details}
      </main>
      <footer className="pub-footer">Gente Digital · Bragança, PA</footer>
    </div>
  );
}

export function PublicBackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="pub-header-action" href={href}><ArrowLeft size={16} />{children}</Link>;
}
