'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, UsersRound, Network, LogOut, X, Wallet, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Avatar from 'boring-avatars';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen }: SidebarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(true);

  useEffect(() => {
    async function getEmail() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
          const adminEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS
            ? process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
            : [];
          if (adminEmails.length > 0 && !adminEmails.includes(user.email.toLowerCase())) {
            setIsAdmin(false);
          }
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
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 md:hidden transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-[#0d0d11] border-r border-zinc-800/80 flex flex-col py-5 z-50 text-slate-100 shadow-xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Mobile close button */}
        <button 
          className="md:hidden absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo Header */}
        <div className="px-5 mb-7 mt-1">
          <div className="relative group flex items-center gap-3">
            {/* Custom Geometric Logo Icon */}
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 p-[1px] shadow-lg shadow-amber-500/10 group-hover:shadow-amber-500/25 transition-all duration-300 shrink-0">
              <div className="w-full h-full bg-zinc-950/90 rounded-[11px] flex items-center justify-center backdrop-blur-sm relative overflow-hidden">
                {/* Subtle ambient light inside logo mark */}
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 via-transparent to-yellow-400/10 opacity-70 group-hover:opacity-100 transition-opacity" />
                {/* Geometric Abstract 'G' & Network Node SVG */}
                <svg className="w-5 h-5 relative z-10 text-amber-400 group-hover:scale-105 transition-transform duration-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 16.6944 7.30558 20.5 12 20.5C15.2582 20.5 18.084 18.6657 19.4975 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M12 12H19.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="19.5" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="19.5" cy="16" r="1.4" fill="currentColor" />
                </svg>
              </div>
            </div>

            {/* Brand Typography */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <h1 className="font-display text-[17px] font-bold text-white tracking-tight leading-none">
                  Gente<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-400 font-extrabold">Digital</span>
                </h1>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[9.5px] font-semibold text-zinc-400 tracking-wider uppercase truncate">Gestão de Vendas</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto relative">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem id="leads" icon={Users} label="Leads & Funil" active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} />
          <NavItem id="colaboradores" icon={UsersRound} label="Colaboradores" active={activeTab === 'colaboradores'} onClick={() => setActiveTab('colaboradores')} />
          <NavItem id="comissoes" icon={Wallet} label="Comissões & PIX" active={activeTab === 'comissoes'} onClick={() => setActiveTab('comissoes')} />
          <NavItem id="integracoes" icon={Network} label="Integrações (IXC & MS)" active={activeTab === 'integracoes'} onClick={() => setActiveTab('integracoes')} />
        </nav>

        {/* User Profile Card */}
        <div className="mt-auto px-3 pt-4 border-t border-zinc-800/80 flex flex-col gap-2">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/60">
            <Avatar size={32} name={userEmail || 'Gente Digital'} variant="beam" colors={['#FFE600', '#0F172A', '#2563EB', '#10B981', '#F59E0B']} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-slate-200 truncate" title={userEmail || 'Usuário Autenticado'}>
                {userEmail ? userEmail.split('@')[0] : 'Administrador'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {isAdmin ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20 uppercase tracking-wider">
                    <ShieldCheck className="w-2.5 h-2.5" /> Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 uppercase tracking-wider">
                    <UserIcon className="w-2.5 h-2.5" /> Vendedor
                  </span>
                )}
              </div>
            </div>
          </div>

          <motion.button 
            whileHover={{ x: 2 }}
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do Sistema</span>
          </motion.button>
        </div>

      </aside>
    </>
  );
}

interface NavItemProps {
  id: string;
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavItem({ icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl transition-all duration-200 group relative text-xs ${
        active
          ? 'text-white font-bold bg-zinc-800/90 border border-zinc-700/60 shadow-sm'
          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40 font-medium border border-transparent'
      }`}
    >
      {active && (
        <motion.div
          layoutId="activeNavIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-amber-400 via-yellow-400 to-amber-500 rounded-r-full shadow-md shadow-amber-400/40"
        />
      )}
      <motion.div whileHover={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
        <Icon className={`w-4 h-4 transition-colors ${active ? 'text-amber-400' : 'text-zinc-400 group-hover:text-zinc-200'}`} />
      </motion.div>
      <span className="truncate">{label}</span>
    </button>
  );
}
