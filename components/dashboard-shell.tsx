'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  isTemporarilyHiddenDashboardTab,
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

function isTabId(value: string | null): value is TabId {
  return value !== null && value in tabNames;
}

export function DashboardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const tabParam = searchParams.get('tab');
  const navigation = resolveDashboardNavigation(tabParam);
  const activeTab: TabId = navigation.activeTab;
  const refParam = searchParams.get('ref');

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

  const handleTabChange = (tab: string) => {
    if (!isTabId(tab) || isTemporarilyHiddenDashboardTab(tab)) return;

    setIsSidebarOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    params.delete('leadId');
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex min-h-screen bg-[var(--app-canvas)] text-[var(--app-ink)] transition-colors">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col transition-all duration-300 md:ml-[6.5rem] lg:ml-[17.5rem]">
        <Header activeTabName={tabNames[activeTab]} onMenuClick={() => setIsSidebarOpen(true)} />

        <main className="relative flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8 xl:px-10">
          {/* Troca de aba imediata: a espera da animação de saída deixava o painel lento. */}
          <div key={activeTab} className="h-full w-full">
            <ActiveView tab={activeTab} />
          </div>
        </main>
      </div>
    </div>
  );
}

function ActiveView({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'dashboard':
      return <DashboardView />;
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
