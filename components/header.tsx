'use client';

import { ChevronRight, Search, Menu } from 'lucide-react';

interface HeaderProps {
  activeTabName: string;
  onMenuClick: () => void;
}

export function Header({ activeTabName, onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-[#18181b] border-b border-brand-border dark:border-gray-800 h-[72px] flex items-center justify-between px-4 md:px-10 shadow-sm transition-colors">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-brand-charcoal dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 text-brand-muted dark:text-gray-400 text-sm font-medium">
          <span className="hover:text-brand-charcoal dark:hover:text-white cursor-pointer transition-colors hidden sm:inline">Painel</span>
          <ChevronRight className="w-4 h-4 hidden sm:inline" />
          <span className="text-brand-charcoal dark:text-white font-semibold animate-in fade-in slide-in-from-left-2 duration-300">
            {activeTabName}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <div className="relative hidden lg:block text-brand-muted dark:text-gray-400 focus-within:text-brand-charcoal dark:focus-within:text-white transition-colors">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            type="text"
            placeholder="Busca rápida..."
            className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-[#27272a] border border-brand-border dark:border-gray-700 rounded-full text-sm focus:outline-none focus:border-brand-yellow dark:focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow dark:text-white transition-all w-64"
          />
        </div>


      </div>
    </header>
  );
}
