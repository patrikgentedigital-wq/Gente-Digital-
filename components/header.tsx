'use client';

import { ChevronRight, Menu, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { BrandMark } from '@/components/brand-mark';

interface HeaderProps {
  activeTabName: string;
  onMenuClick: () => void;
}

const emptySubscribe = () => () => {};

export function Header({ activeTabName, onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  return (
    <header className="sticky top-0 z-40 h-[68px] border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-canvas)_92%,transparent)] px-4 backdrop-blur-xl transition-colors md:px-8 xl:px-10">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuClick}
          type="button"
          aria-label="Abrir menu de navegação"
          className="-ml-2 rounded-xl p-2 text-[var(--app-muted)] transition-colors hover:bg-black/5 hover:text-[var(--app-ink)] dark:hover:bg-white/5 md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--app-muted)]">
          <span className="inline-flex shrink-0 items-center rounded-md bg-[#171717] px-2 py-1">
            <BrandMark compact />
          </span>
          <ChevronRight className="hidden h-3.5 w-3.5 opacity-50 sm:inline" />
          <span className="max-w-[45vw] truncate text-sm font-semibold tracking-tight text-[var(--app-ink)] sm:max-w-none">
            {activeTabName}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {mounted ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            type="button"
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-2 text-[var(--app-muted)] shadow-sm transition-colors hover:text-[var(--app-ink)]"
            title="Alternar Tema"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-[var(--app-muted)]" />}
          </motion.button>
        ) : (
          <div className="w-8 h-8 rounded-lg" />
        )}
      </div>
    </header>
  );
}
