'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { DashboardView } from '@/components/views/dashboard';
import { LeadsView } from '@/components/views/leads';
import { ColaboradoresView } from '@/components/views/colaboradores';
import { IntegracoesView } from '@/components/views/integracoes';
import { ConfiguracoesView } from '@/components/views/configuracoes';
import { FormsView } from '@/components/views/forms';

export default function Page() {
  const [activeTab, setActiveTab] = useState('colaboradores');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const renderView = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView />;
      case 'leads': return <LeadsView />;
      case 'colaboradores': return <ColaboradoresView />;
      case 'integracoes': return <IntegracoesView />;
      case 'forms': return <FormsView />;
      case 'configuracoes': return <ConfiguracoesView />;
      default: return <ColaboradoresView />;
    }
  };

  const getTabName = () => {
    const names: Record<string, string> = {
      dashboard: 'Dashboard',
      leads: 'Leads',
      colaboradores: 'Colaboradores',
      integracoes: 'Integrações (IXC & MS)',
      forms: 'Google Forms',
      configuracoes: 'Configurações'
    };
    return names[activeTab] || 'Painel';
  };

  return (
    <div className="flex min-h-screen bg-brand-surface dark:bg-gray-900 transition-colors">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => { setActiveTab(tab); setIsSidebarOpen(false); }} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
      />
      
      <div className="flex-1 flex flex-col md:ml-64 w-full transition-all duration-300">
        <Header activeTabName={getTabName()} onMenuClick={() => setIsSidebarOpen(true)} />
        
        <main className="flex-1 p-4 md:p-10 overflow-y-auto">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
