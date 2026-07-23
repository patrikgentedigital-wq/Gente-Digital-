'use client';

import { ChevronRight, Menu, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

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
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0f0f12]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-zinc-800/80 h-[68px] flex items-center justify-between px-4 md:px-8 transition-colors">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm font-medium">
          <span className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors hidden sm:inline">Gente Digital</span>
          <ChevronRight className="w-3.5 h-3.5 hidden sm:inline opacity-60" />
          <span className="text-slate-900 dark:text-slate-100 font-bold text-sm tracking-tight">
            {activeTabName}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {mounted && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700/50 transition-colors"
            title="Alternar Tema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </motion.button>
        )}
      </div>
    </header>
  );
}
