'use client';

import { ChevronRight, Menu, Sun, Moon, Sparkles, Command } from 'lucide-react';
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
    <header className="sticky top-0 z-40 glass-header border-b border-brand-border/60 dark:border-white/10 h-[72px] flex items-center justify-between px-4 md:px-8 shadow-sm transition-colors">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-brand-charcoal dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 text-brand-muted dark:text-gray-400 text-sm font-medium">
          <span className="hover:text-brand-charcoal dark:hover:text-white cursor-pointer transition-colors hidden sm:inline">Gente Digital</span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 hidden sm:inline" />
          <span className="text-brand-charcoal dark:text-white font-extrabold text-base tracking-tight animate-in fade-in slide-in-from-left-2 duration-300">
            {activeTabName}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        {/* System Status Pill */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Sistema Conectado • IXC Soft</span>
        </div>

        {/* Quick Search Badge Shortcut */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-brand-border dark:border-white/10 text-xs text-brand-muted dark:text-gray-400 font-medium">
          <Command className="w-3.5 h-3.5" />
          <span>Atalho</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-zinc-800 border border-gray-200 dark:border-gray-700 rounded shadow-xs">⌘K</kbd>
        </div>

        {/* Theme Toggle Button */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2.5 text-brand-muted hover:text-brand-charcoal dark:hover:text-white rounded-xl bg-gray-100/80 dark:bg-white/5 border border-transparent dark:border-white/10 hover:border-brand-border dark:hover:border-white/20 transition-all shadow-xs"
            title="Alternar Tema (Claro / Escuro)"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-brand-yellow" /> : <Moon className="w-4 h-4 text-brand-charcoal" />}
          </button>
        )}
      </div>
    </header>
  );
}
