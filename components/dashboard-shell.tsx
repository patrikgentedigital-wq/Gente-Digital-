'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { workspaceItems, type WorkspaceItem } from './workspace-navigation';
import { isAnalyticsTabId } from '@/lib/analytics/navigation';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  resolveDashboardNavigation,
} from '@/lib/dashboard-navigation';

const DashboardView = dynamic(
  () => import('@/components/views/dashboard').then((module) => module.DashboardView),
  { loading: ViewLoading }
);
const LeadsView = dynamic(
  () => import('@/components/views/leads').then((module) => module.LeadsView),
  { loading: ViewLoading }
);
const VendasRastreamentoView = dynamic(
  () => import('@/components/views/vendas-rastreamento').then((module) => module.VendasRastreamentoView),
  { loading: ViewLoading }
);
const ColaboradoresView = dynamic(
  () => import('@/components/views/colaboradores').then((module) => module.ColaboradoresView),
  { loading: ViewLoading }
);
const ComissoesView = dynamic(
  () => import('@/components/views/comissoes').then((module) => module.ComissoesView),
  { loading: ViewLoading }
);
const IntegracoesView = dynamic(
  () => import('@/components/views/integracoes').then((module) => module.IntegracoesView),
  { loading: ViewLoading }
);
const AnalyticsView = dynamic(
  () => import('@/components/views/analytics/analytics-view').then((module) => module.AnalyticsView),
  { loading: ViewLoading }
);
const ViabilidadeView = dynamic(
  () => import('@/components/views/viabilidade').then((module) => module.ViabilidadeView),
  { loading: ViewLoading }
);

const tabNames = {
  dashboard: 'Dashboard',
  leads: 'Leads & Funil',
  viabilidade: 'Viabilidade de instalação',
  vendas: 'Vendas & Rastreamento',
  colaboradores: 'Colaboradores',
  comissoes: 'Gestão de Comissões & PIX',
  integracoes: 'Integrações (IXC & MS)',
  indicadores: 'Indicadores',
} as const;

type TabId = keyof typeof tabNames;

const desktopQuery = '(min-width: 768px)';
function subscribeToBreakpoint(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function DashboardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const desktop = useSyncExternalStore(subscribeToBreakpoint, () => window.matchMedia(desktopQuery).matches, () => false);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const closeMenu = useCallback(() => setIsSidebarOpen(false), []);
  const tabParam = searchParams.get('tab');
  const navigation = resolveDashboardNavigation(tabParam);
  const activeTab: TabId = navigation.activeTab;
  const refParam = searchParams.get('ref');
  const requestedAnalytics = searchParams.get('indicadores');
  const analyticId = isAnalyticsTabId(requestedAnalytics) ? requestedAnalytics : 'geral';
  const activeId = activeTab === 'indicadores' ? 'indicadores-' + analyticId : activeTab;
  const items = workspaceItems(role === 'admin');
  const selected = items.find(item => item.id === activeId);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/users/me', { signal: controller.signal })
      .then(async res => res.ok ? (await res.json()).role : 'vendedor')
      .then(userRole => { if (!controller.signal.aborted) setRole(userRole ?? 'vendedor'); })
      .catch(() => { if (!controller.signal.aborted) setRole('vendedor'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!navigation.redirectHiddenTab) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'dashboard');
    router.replace(`?${params.toString()}`);
  }, [navigation.redirectHiddenTab, router, searchParams]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login');
      else setEmail(user.email ?? '');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.push('/login');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!refParam) return;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    document.cookie = [
      `gente_digital_ref=${encodeURIComponent(refParam)}`,
      `expires=${expiresAt.toUTCString()}`,
      'path=/',
      'SameSite=Lax',
    ].join('; ');
  }, [refParam]);

  const hrefFor = (item: WorkspaceItem) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', item.tab);
    if (item.analytics) params.set('indicadores', item.analytics);
    else params.delete('indicadores');
    params.delete('leadId');
    return `/?${params.toString()}`;
  };

  return (
    <div className={`gd-workspace ${compact ? 'rail-collapsed' : ''}`}>
      <Sidebar activeId={activeId} items={items} hrefFor={hrefFor} email={email} role={role} isOpen={isSidebarOpen} onClose={closeMenu} />
      <div className="workspace-main">
        <Header activeName={selected?.label ?? tabNames[activeTab]} section={activeTab === 'indicadores' ? 'Indicadores' : 'Programa'} items={items} hrefFor={hrefFor}
          expanded={desktop ? !compact : isSidebarOpen} onMenuClick={() => {if(desktop)setCompact(value => !value);else setIsSidebarOpen(value => !value);}} />

        <main className="relative flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8 xl:px-10">
          {/* Troca de aba imediata: a espera da animação de saída deixava o painel lento. */}
          <div key={activeTab} className="h-full w-full">
            <ActiveView tab={activeTab} navigation={activeTab === 'dashboard' && role === 'admin' ? <nav className="dashboard-quick-tabs" aria-label="Visões de desempenho">
              {items.filter(item => item.tab === 'dashboard' || item.analytics).map(item => <Link key={item.id} href={hrefFor(item)} aria-current={item.tab === 'dashboard' ? 'page' : undefined}>
                <item.icon size={15}/>{item.tab === 'dashboard' ? 'Visão geral' : item.label}
              </Link>)}
            </nav> : undefined} />
          </div>
        </main>
      </div>
    </div>
  );
}

function ActiveView({ tab, navigation }: { tab: TabId; navigation?: ReactNode }) {
  switch (tab) {
    case 'dashboard':
      return <DashboardView navigation={navigation} />;
    case 'leads':
      return <LeadsView />;
    case 'viabilidade':
      return <ViabilidadeView />;
    case 'vendas':
      return <VendasRastreamentoView />;
    case 'colaboradores':
      return <ColaboradoresView />;
    case 'comissoes':
      return <ComissoesView />;
    case 'integracoes':
      return <IntegracoesView />;
    case 'indicadores':
      return <AnalyticsView />;
    default:
      return <DashboardView />;
  }
}

function ViewLoading() {
  return (
    <div className="space-y-4" aria-label="Carregando seção">
      <div className="h-8 w-56 animate-pulse rounded-md bg-[var(--app-border)]" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]"
          />
        ))}
      </div>
    </div>
  );
}
