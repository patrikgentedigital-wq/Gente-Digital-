'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, UsersRound, Network, LogOut, X, Wallet, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Avatar from 'boring-avatars';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen }: SidebarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(true); // Default to admin for complete view or detect via email

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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-[#0f0f13] border-r border-white/10 flex flex-col py-6 z-50 text-white shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Mobile close button */}
        <button 
          className="md:hidden absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Logo Header */}
        <div className="px-6 mb-8 mt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-yellow via-amber-300 to-amber-500 flex items-center justify-center text-brand-charcoal font-black text-xl shadow-[0_0_20px_rgba(255,230,0,0.3)] shrink-0">
              G
            </div>
            <div>
              <h1 className="font-display text-xl font-black text-white leading-tight tracking-tight">
                Gente<span className="text-brand-yellow">Digital</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">Gestão & Indicações</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1.5 px-3 overflow-y-auto">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem id="leads" icon={Users} label="Leads & Funil" active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} />
          <NavItem id="colaboradores" icon={UsersRound} label="Colaboradores" active={activeTab === 'colaboradores'} onClick={() => setActiveTab('colaboradores')} />
          <NavItem id="comissoes" icon={Wallet} label="Comissões & PIX" active={activeTab === 'comissoes'} onClick={() => setActiveTab('comissoes')} />
          <NavItem id="integracoes" icon={Network} label="Integrações (IXC & MS)" active={activeTab === 'integracoes'} onClick={() => setActiveTab('integracoes')} />
        </nav>

        {/* User Card */}
        <div className="mt-auto px-3 pt-4 border-t border-white/10 flex flex-col gap-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
            <Avatar size={34} name={userEmail || 'Gente Digital'} variant="beam" colors={['#FFE600', '#2E2D32', '#3B82F6', '#10B981', '#F59E0B']} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-white truncate" title={userEmail || 'Usuário Autenticado'}>
                {userEmail ? userEmail.split('@')[0] : 'Administrador'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {isAdmin ? (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 bg-amber-500/20 text-brand-yellow rounded border border-amber-500/30 uppercase tracking-wide">
                    <ShieldCheck className="w-2.5 h-2.5" /> Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30 uppercase tracking-wide">
                    <UserIcon className="w-2.5 h-2.5" /> Colaborador
                  </span>
                )}
              </div>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-red-400 hover:text-white hover:bg-red-500/20 font-medium text-xs"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do Sistema</span>
          </button>
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
      className={`w-full flex items-center gap-3 py-3 rounded-xl pl-4 pr-3 transition-all duration-200 group relative ${
        active
          ? 'text-brand-yellow font-bold bg-white/10 shadow-[0_0_15px_rgba(255,230,0,0.1)] border-l-4 border-brand-yellow'
          : 'text-gray-400 hover:text-brand-yellow hover:bg-white/5 font-medium'
      }`}
    >
      <Icon className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${active ? 'text-brand-yellow' : 'text-gray-400 group-hover:text-brand-yellow'}`} />
      <span className="text-sm truncate">{label}</span>
    </button>
  );
}
