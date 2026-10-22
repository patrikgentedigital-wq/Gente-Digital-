'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, UsersRound, MapPin, LogOut, X, Wallet, ShieldCheck, User as UserIcon, type LucideIcon } from 'lucide-react';
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
  viabilidade: MapPin,
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
      <aside className={`fixed left-3 top-3 z-50 flex h-[calc(100vh-1.5rem)] w-64 flex-col rounded-[28px] bg-[var(--app-sidebar)] py-5 text-[#0e1b2c] shadow-xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-[120%] md:translate-x-0'}`}>
        {/* Mobile close button */}
        <button
          type="button"
          aria-label="Fechar menu de navegação"
          className="md:hidden absolute top-5 right-5 text-[#0e1b2c]/70 hover:text-[#0e1b2c] transition-colors"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-8 mt-1 px-5">
          <BrandMark showTagline tone="onYellow" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1.5 px-3 overflow-y-auto relative">
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
        <div className="mt-auto flex flex-col gap-2 px-3 pt-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2.5">
            <Avatar size={32} name={userEmail || 'Gente Digital'} variant="beam" colors={['#FFE300', '#0E1B2C', '#1F6FD6', '#1FA855', '#F28A1E']} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-[#0e1b2c] truncate" title={userEmail || 'Usuário Autenticado'}>
                {userEmail ? userEmail.split('@')[0] : 'Administrador'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {userRole === 'admin' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-[#0e1b2c] text-[#ffe300] rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Admin
                  </span>
                ) : userRole === 'vendedor' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 border border-[#0e1b2c] text-[#0e1b2c] rounded-full">
                    <UserIcon className="w-3 h-3" /> Vendedor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 border border-[#0e1b2c]/40 text-[#0e1b2c]/60 rounded-full">
                    <UserIcon className="w-3 h-3" /> ...
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
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-full transition-colors text-[#0e1b2c]/80 hover:text-[#0e1b2c] hover:bg-[#0e1b2c]/10 text-sm font-semibold"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do sistema</span>
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
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-3 py-3 px-4 rounded-full transition-colors duration-150 group relative text-sm ${
        active
          ? 'bg-[#0e1b2c] font-bold text-[#ffe300] shadow-md'
          : 'font-semibold text-[#0e1b2c] hover:bg-white/50'
      }`}
    >
      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-[#ffe300]' : 'text-[#0e1b2c]'}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}
