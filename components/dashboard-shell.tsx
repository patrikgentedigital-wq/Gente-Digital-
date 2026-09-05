'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

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

const tabNames = {
  dashboard: 'Dashboard',
  leads: 'Leads & Funil',
  vendas: 'Vendas & Rastreamento',
  colaboradores: 'Colaboradores',
  comissoes: 'Gestão de Comissões & PIX',
  integracoes: 'Integrações (IXC & MS)',
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
  const activeTab: TabId = isTabId(tabParam) ? tabParam : 'dashboard';
  const refParam = searchParams.get('ref');

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
    if (!isTabId(tab)) return;

    setIsSidebarOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 transition-colors dark:bg-[#09090B] dark:text-slate-100">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col transition-all duration-300 md:ml-64">
        <Header activeTabName={tabNames[activeTab]} onMenuClick={() => setIsSidebarOpen(true)} />

        <main className="relative flex-1 overflow-x-hidden p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.995 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full"
            >
              <ActiveView tab={activeTab} />
            </motion.div>
          </AnimatePresence>
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
    case 'vendas':
      return <VendasRastreamentoView />;
    case 'colaboradores':
      return <ColaboradoresView />;
    case 'comissoes':
      return <ComissoesView />;
    case 'integracoes':
      return <IntegracoesView />;
    default:
      return <DashboardView />;
  }
}

function ViewLoading() {
  return (
    <div className="space-y-4" aria-label="Carregando seção">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200 dark:bg-zinc-800" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    </div>
  );
}
