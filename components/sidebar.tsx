'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ExternalLink, LogOut, UserRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BrandMark } from '@/components/brand-mark';
import type { WorkspaceItem } from './workspace-navigation';

interface SidebarProps {
  items: WorkspaceItem[];
  activeId: string;
  hrefFor: (item: WorkspaceItem) => string;
  email: string;
  role: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ items, activeId, hrefFor, email, role, isOpen, onClose }: SidebarProps) {
  const sidebar = useRef<HTMLElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    sidebar.current?.querySelector<HTMLButtonElement>('.rail-close')?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const links = Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button,a[href]') ?? []).filter(el => el.offsetWidth > 0);
      const end = event.shiftKey ? links[0] : links.at(-1);
      if (end && document.activeElement === end) {
        event.preventDefault();
        (event.shiftKey ? links.at(-1) : links[0])?.focus();
      }
    };
    const wide = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (wide.matches) onClose(); };
    wide.addEventListener('change', closeOnDesktop);
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('keydown', keys);
      wide.removeEventListener('change', closeOnDesktop);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen, onClose]);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (!error) { router.push('/login'); router.refresh(); }
  }
  return <>
    {isOpen && <button type="button" className="rail-backdrop" tabIndex={-1} aria-label="Fechar navegação" onClick={onClose} />}
    <aside ref={sidebar} id="workspace-navigation" className={`workspace-rail ${isOpen ? 'is-open' : ''}`} aria-label="Navegação do sistema">
      <div className="rail-brand"><Link href="/?tab=dashboard" onClick={onClose} aria-label="Gente Digital, página inicial"><BrandMark /></Link>
        <button className="rail-close" type="button" aria-label="Fechar menu" onClick={onClose}><X size={18}/></button>
      </div>
      <nav className="rail-nav" aria-label="Menu principal">
        {(['Programa','Indicadores'] as const).map(section => {
          const group = items.filter(item => item.section === section);
          if (!group.length) return null;
          return <div key={section} className="rail-group"><p className="rail-label">{section}</p>
            {group.map(item => <Link key={item.id} href={hrefFor(item)} prefetch={false} onClick={onClose}
              className="rail-item" title={item.label} aria-current={activeId === item.id ? 'page' : undefined}>
              <item.icon size={18} aria-hidden="true"/><span>{item.label}</span>
            </Link>)}
          </div>;
        })}
      </nav>
      <div className="rail-bottom">
        <Link href="/indicar" className="rail-item" title="Página de indicação" onClick={onClose}><ExternalLink size={16}/><span>Página de indicação</span></Link>
        <button type="button" className="rail-item" onClick={logout} title="Sair do sistema" aria-label="Sair do sistema"><LogOut size={16}/><span>Sair do sistema</span></button>
        <div className="rail-account" title={email || 'Minha conta'}><i><UserRound size={16}/></i><div>
          <strong>{email ? email.split('@')[0] : 'Minha conta'}</strong>{role && <small>{role === 'admin' ? 'Administrador' : 'Vendedor'}</small>}
        </div></div>
      </div>
    </aside>
  </>;
}
