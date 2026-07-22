'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, UsersRound, Network, Settings, Plus, LogOut, X, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen }: SidebarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    async function getEmail() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
      } catch (e) {}
    }
    getEmail();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-brand-charcoal flex flex-col py-6 z-50 text-white shadow-xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Mobile close button */}
        <button 
          className="md:hidden absolute top-6 right-6 text-gray-400 hover:text-white"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Logo */}
        <div className="px-6 mb-8 mt-2">
          <h1 className="font-display text-[32px] font-bold text-brand-yellow leading-tight tracking-tight">
            Gente<br />Digital
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem id="leads" icon={Users} label="Leads" active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} />
          <NavItem id="colaboradores" icon={UsersRound} label="Colaboradores" active={activeTab === 'colaboradores'} onClick={() => setActiveTab('colaboradores')} />
          <NavItem id="comissoes" icon={Wallet} label="Comissões & PIX" active={activeTab === 'comissoes'} onClick={() => setActiveTab('comissoes')} />
          <NavItem id="integracoes" icon={Network} label="Integrações (IXC & MS)" active={activeTab === 'integracoes'} onClick={() => setActiveTab('integracoes')} />
        </nav>

        {/* User Actions */}
        <div className="mt-auto px-3 pt-6 border-t border-white/10 flex flex-col gap-2">
          {userEmail && (
            <p className="px-4 text-xs text-gray-400 truncate" title={userEmail}>
              {userEmail}
            </p>
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-red-400 hover:text-white hover:bg-red-500/20 font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Sair do Sistema</span>
          </button>
        </div>

      </aside>
    </>
  );
}

function NavItem({ icon: Icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 py-3.5 rounded-xl pl-4 transition-all ${
        active
          ? 'text-brand-yellow font-bold border-l-4 border-brand-yellow bg-white/5'
          : 'text-gray-400 hover:text-brand-yellow hover:bg-white/5 font-medium'
      }`}
    >
      <Icon className={`w-5 h-5 ${active ? 'animate-pulse' : ''}`} style={{ animationDuration: '3s' }} />
      <span className="text-sm">{label}</span>
    </button>
  );
}
