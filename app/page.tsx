'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { DashboardView } from '@/components/views/dashboard';
import { LeadsView } from '@/components/views/leads';
import { ColaboradoresView } from '@/components/views/colaboradores';
import { ComissoesView } from '@/components/views/comissoes';
import { IntegracoesView } from '@/components/views/integracoes';
import { AnimatePresence, motion } from 'motion/react';


export default function Page() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-brand-surface dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4 text-brand-muted">
          <div className="w-10 h-10 border-4 border-brand-yellow border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold">Carregando painel...</p>
        </div>
      </div>
    }>
      <PageContent />
    </Suspense>
  );
}

function PageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get active tab from URL or fallback to default
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam || 'colaboradores';
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Sync state when URL changes
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      const timer = setTimeout(() => {
        setActiveTab(tabParam);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [tabParam, activeTab]);

  // Capture referral ref parameter from URL and store in a cookie for 30 days
  const refParam = searchParams.get('ref');
  useEffect(() => {
    if (refParam) {
      const date = new Date();
      date.setTime(date.getTime() + (30 * 24 * 60 * 60 * 1000));
      const expires = "; expires=" + date.toUTCString();
      document.cookie = "gente_digital_ref=" + refParam + expires + "; path=/; SameSite=Lax";
      console.log('Saved referral cookie:', refParam);
    }
  }, [refParam]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
    
    // Update URL query parameter
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`?${params.toString()}`);
  };

  const renderView = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView />;
      case 'leads': return <LeadsView />;
      case 'colaboradores': return <ColaboradoresView />;
      case 'comissoes': return <ComissoesView />;
      case 'integracoes': return <IntegracoesView />;
      default: return <ColaboradoresView />;
    }
  };

  const getTabName = () => {
    const names: Record<string, string> = {
      dashboard: 'Dashboard',
      leads: 'Leads',
      colaboradores: 'Colaboradores',
      comissoes: 'Gestão de Comissões & PIX',
      integracoes: 'Integrações (IXC & MS)'
    };
    return names[activeTab] || 'Painel';
  };

  return (
    <div className="flex min-h-screen bg-brand-surface dark:bg-gray-900 transition-colors">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
      />
      
      <div className="flex-1 flex flex-col md:ml-64 min-w-0 transition-all duration-300">
        <Header activeTabName={getTabName()} onMenuClick={() => setIsSidebarOpen(true)} />
        
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full w-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
