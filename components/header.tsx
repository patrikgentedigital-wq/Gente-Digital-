'use client';

import { ChevronRight, Search, Menu, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

interface HeaderProps {
  activeTabName: string;
  onMenuClick: () => void;
}

export function Header({ activeTabName, onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 text-brand-muted hover:text-brand-charcoal dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Alternar Tema"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-brand-yellow" /> : <Moon className="w-5 h-5" />}
          </button>
        )}
      </div>
    </header>
  );
}
