'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, UsersRound, LogOut, X, Wallet, ShieldCheck, User as UserIcon, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Avatar from 'boring-avatars';
import { motion } from 'motion/react';
import { SIDEBAR_NAV_ITEMS, type SidebarTabId } from '@/lib/dashboard-navigation';
import { BrandMark } from '@/components/brand-mark';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const NAV_ICONS: Record<SidebarTabId, LucideIcon> = {
  dashboard: LayoutDashboard,
  leads: Users,
  colaboradores: UsersRound,
  comissoes: Wallet,
};

export function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen }: SidebarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>('');
  const [userRole, setUserRole] = useState<'admin' | 'vendedor' | null>(null);

  useEffect(() => {
    async function loadUserInfo() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
        // Busca role real do Supabase user_roles
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.role ?? 'vendedor');
        } else {
          setUserRole('vendedor');
        }
      } catch (e) {
        setUserRole('vendedor');
      }
    }
    loadUserInfo();
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
      <aside className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-[var(--app-sidebar-border)] bg-[var(--app-sidebar)] py-5 text-slate-100 shadow-2xl shadow-black/10 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Mobile close button */}
        <button 
          type="button"
          aria-label="Fechar menu de navegação"
          className="md:hidden absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-7 mt-1 px-5">
          <BrandMark showTagline />
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto relative">
          {SIDEBAR_NAV_ITEMS.map(({ id, label }) => (
            <NavItem
              key={id}
              id={id}
              icon={NAV_ICONS[id]}
              label={label}
              active={activeTab === id}
              onClick={() => setActiveTab(id)}
            />
          ))}
        </nav>

        {/* User Profile Card */}
        <div className="mt-auto flex flex-col gap-2 border-t border-[var(--app-sidebar-border)] px-3 pt-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
            <Avatar size={32} name={userEmail || 'Gente Digital'} variant="beam" colors={['#FFE600', '#0F172A', '#2563EB', '#10B981', '#F59E0B']} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-slate-200 truncate" title={userEmail || 'Usuário Autenticado'}>
                {userEmail ? userEmail.split('@')[0] : 'Administrador'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {userRole === 'admin' ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20 uppercase tracking-wider">
                    <ShieldCheck className="w-2.5 h-2.5" /> Admin
                  </span>
                ) : userRole === 'vendedor' ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 uppercase tracking-wider">
                    <UserIcon className="w-2.5 h-2.5" /> Vendedor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-zinc-700/40 text-zinc-400 rounded border border-zinc-700/30 uppercase tracking-wider">
                    <UserIcon className="w-2.5 h-2.5" /> ...
                  </span>
                )}
              </div>
            </div>
          </div>

          <motion.button 
            whileHover={{ x: 2 }}
            onClick={handleLogout}
            type="button"
            aria-label="Sair do sistema"
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
  icon: LucideIcon;
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
        ? 'border border-[#ffe600]/15 bg-[#ffe600]/10 font-bold text-white shadow-sm'
          : 'border border-transparent font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
      }`}
    >
      {active && (
        <motion.div
          layoutId="activeNavIndicator"
          className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#ffe600] shadow-md shadow-yellow-400/30"
        />
      )}
      <motion.div whileHover={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
        <Icon className={`h-4 w-4 transition-colors ${active ? 'text-[#ffe600]' : 'text-zinc-400 group-hover:text-zinc-200'}`} />
      </motion.div>
      <span className="truncate">{label}</span>
    </button>
  );
}
