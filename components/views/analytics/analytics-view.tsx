'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ANALYTICS_TABS, isAnalyticsTabId, type AnalyticsTabId } from '@/lib/analytics/navigation';
import { CancelamentosView } from './cancelamentos-view';
import { CommercialView } from './commercial-view';

export function AnalyticsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab: AnalyticsTabId = isAnalyticsTabId(searchParams.get('indicadores'))
    ? searchParams.get('indicadores') as AnalyticsTabId
    : 'geral';

  const setActiveTab = useCallback((tab: AnalyticsTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'indicadores');
    params.set('indicadores', tab);
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <nav className="flex flex-wrap gap-2 border-b border-[var(--app-border)] pb-2" aria-label="Abas de indicadores">
        {ANALYTICS_TABS.map(({ id, label }) => (
          <button key={id} type="button" aria-current={id === activeTab ? 'page' : undefined}
            onClick={() => setActiveTab(id)}
            className={'rounded-full px-4 py-2 text-sm font-semibold outline-offset-2 focus-visible:outline-2 '
              + (id === activeTab ? 'bg-[#ffe300] text-[#0e1b2c]' : 'text-[var(--app-ink)] hover:bg-[var(--app-panel)]')}>
            {label}
          </button>
        ))}
      </nav>
      {activeTab === 'geral' ? <CommercialView /> : <CancelamentosView />}
    </div>
  );
}
