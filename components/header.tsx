'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronRight, Moon, PanelLeft, Search, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { BrandMark } from './brand-mark';
import type { WorkspaceItem } from './workspace-navigation';

const subscribe = () => () => {};
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function Header({ activeName, section, items, hrefFor, expanded, onMenuClick }: {
  activeName: string; section: string; items: WorkspaceItem[];
  hrefFor: (item: WorkspaceItem) => string; expanded: boolean; onMenuClick: () => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const modal = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  function openSearch() {
    if (!modal.current || modal.current.open) return;
    setQuery('');
    modal.current.showModal();
    field.current?.focus();
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  const matching = items.filter(item => normalized(item.section+' '+item.label).includes(normalized(query.trim())));
  const dark = mounted && resolvedTheme === 'dark';
  return <header className="workspace-topbar">
    <div className="topbar-location">
      <button className="topbar-icon" type="button" onClick={onMenuClick} aria-label="Alternar menu de navegação" aria-controls="workspace-navigation" aria-expanded={expanded}><PanelLeft size={18}/></button>
      <Link className="topbar-brand" href="/?tab=dashboard" aria-label="Gente Digital, página inicial"><BrandMark compact/></Link>
      <div className="topbar-breadcrumb"><span>{section}</span><ChevronRight size={13}/><strong>{activeName}</strong></div>
    </div>
    <div className="topbar-tools">
      <button type="button" className="topbar-search" onClick={openSearch} aria-label="Buscar no sistema"><Search size={16}/><span>Buscar no sistema</span><kbd>Ctrl K</kbd></button>
      <button className="topbar-icon" type="button" disabled={!mounted} aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'} title={dark ? 'Ativar tema claro' : 'Ativar tema escuro'} onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
    </div>
    <dialog ref={modal} className="workspace-search-dialog" aria-labelledby="workspace-search-label" onClick={e => {if(e.target === modal.current) {const r=modal.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.current.close();}}}>
      <div className="search-heading"><h2 id="workspace-search-label">Buscar no sistema</h2><button className="topbar-icon" type="button" onClick={() => modal.current?.close()} aria-label="Fechar busca"><X size={17}/></button></div>
      <label className="search-field"><Search size={17}/><input ref={field} value={query} aria-label="Nome da tela" placeholder="Nome da tela" onChange={e=>setQuery(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter') {e.preventDefault();modal.current?.querySelector<HTMLAnchorElement>('.search-results a')?.click();}}}/></label>
      <nav aria-label="Resultados da busca" className="search-results">
        {matching.map(item=><Link key={item.id} href={hrefFor(item)} prefetch={false} onClick={()=>modal.current?.close()}><item.icon size={17}/>{item.label}</Link>)}
        {!matching.length && <p role="status">Nenhuma tela encontrada.</p>}
      </nav>
    </dialog>
  </header>;
}
