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
        <div className="px-6 mb-7 mt-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-yellow flex items-center justify-center text-slate-950 font-black text-lg shadow-sm shrink-0">
              G
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-white leading-none tracking-tight">
                Gente<span className="text-brand-yellow">Digital</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase mt-1">Gestão de Vendas</p>
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
      className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-150 group relative text-xs font-semibold ${
        active
          ? 'text-slate-950 font-bold bg-brand-yellow shadow-sm'
          : 'text-slate-400 hover:text-slate-100 hover:bg-zinc-800/60 font-medium'
      }`}
    >
      <motion.div whileHover={{ scale: 1.15 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
        <Icon className={`w-4 h-4 ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-200'}`} />
      </motion.div>
      <span className="truncate">{label}</span>
    </button>
  );
}
