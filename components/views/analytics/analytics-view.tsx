'use client';

import { CalendarDays, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { AnalyticsOverviewResponse } from '@/lib/analytics/response';
import {
  ANALYTICS_TABS,
  isAnalyticsTabId,
  type AnalyticsTabId,
} from '@/lib/analytics/navigation';

import { CancelamentosView } from './cancelamentos-view';
import { CommercialView } from './commercial-view';
import { AnalyticsUnavailable } from './analytics-primitives';

type ViewStatus = 'loading' | 'ready' | 'unavailable' | 'error';

function localDateToBoundary(value: string, endOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}-03:00`;
}

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
            className={'rounded-lg px-4 py-2 text-sm font-semibold outline-offset-2 focus-visible:outline-2 '
              + (id === activeTab ? 'bg-[#ffe300] text-[#0e1b2c]' : 'text-[var(--app-ink)] hover:bg-[var(--app-panel)]')}>
            {label}
          </button>
        ))}
      </nav>
      {activeTab === 'geral' ? <CommercialView /> : <CancelamentosPanel />}
    </div>
  );
}

function CancelamentosPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [fromDate, setFromDate] = useState(searchParams.get('analyticsFrom') ?? '');
  const [toDate, setToDate] = useState(searchParams.get('analyticsTo') ?? '');
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [viewStatus, setViewStatus] = useState<ViewStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setViewStatus('loading');
    setErrorMessage(null);

    const params = new URLSearchParams();
    const from = localDateToBoundary(fromDate, false);
    const to = localDateToBoundary(toDate, true);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    try {
      const query = params.toString();
      const response = await fetch(`/api/analytics/overview${query ? `?${query}` : ''}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as Partial<AnalyticsOverviewResponse> & { error?: string } | null;

      if (!response.ok) {
        setOverview(null);
        setViewStatus(response.status === 503 ? 'unavailable' : 'error');
        setErrorMessage(payload?.error ?? 'Não foi possível consultar os indicadores.');
        return;
      }

      if (!payload || payload.success !== true || !payload.data || !payload.meta) {
        setOverview(null);
        setViewStatus('error');
        setErrorMessage('A resposta dos indicadores não corresponde ao contrato esperado.');
        return;
      }

      setOverview(payload as AnalyticsOverviewResponse);
      setViewStatus('ready');
      const nextParams = new URLSearchParams(window.location.search);
      if (fromDate) nextParams.set('analyticsFrom', fromDate); else nextParams.delete('analyticsFrom');
      if (toDate) nextParams.set('analyticsTo', toDate); else nextParams.delete('analyticsTo');
      nextParams.set('tab', 'indicadores');
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    } catch {
      setOverview(null);
      setViewStatus('error');
      setErrorMessage('Não foi possível conectar ao serviço de indicadores.');
    }
  }, [fromDate, pathname, router, toDate]);

  const hasLoadedInitially = useRef(false);
  useEffect(() => {
    if (hasLoadedInitially.current) return;
    hasLoadedInitially.current = true;
    const timer = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-amber-400">Indique e Ganhe / centro de indicadores</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">Consulta de cancelamentos</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Consulte os cancelamentos do IXC que já foram sincronizados com a base de indicadores.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={viewStatus === 'loading'}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-amber-400/40 hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B] disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${viewStatus === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          Consultar base
        </button>
      </header>

      <section className="grid gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
        <div className="md:col-span-1">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            <CalendarDays className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            Janela analítica
          </div>
          <p className="text-xs leading-5 text-zinc-600">Deixe em branco para consultar todo o período disponível.</p>
        </div>
        <label className="text-xs font-medium text-zinc-400">
          De
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-amber-400/60 focus:ring-2 focus:ring-amber-300/20"
          />
        </label>
        <label className="text-xs font-medium text-zinc-400">
          Até
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-amber-400/60 focus:ring-2 focus:ring-amber-300/20"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadOverview()}
          className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-yellow-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          Aplicar período
        </button>
      </section>

      {viewStatus === 'loading' && (
        <div className="space-y-4" role="status" aria-label="Carregando indicadores">
          <div className="h-20 animate-pulse rounded-2xl bg-zinc-900 motion-reduce:animate-none" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-zinc-900 motion-reduce:animate-none" />)}
          </div>
        </div>
      )}

      {viewStatus === 'unavailable' && <AnalyticsUnavailable onRetry={() => void loadOverview()} />}

      {viewStatus === 'error' && (
        <div className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] px-6 py-12 text-center" role="alert">
          <ShieldAlert className="mx-auto h-8 w-8 text-rose-300" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-bold text-white">Não foi possível ler os indicadores</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">{errorMessage ?? 'Verifique a sessão e tente novamente.'}</p>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="mt-6 rounded-xl border border-rose-300/30 px-4 py-2.5 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-300/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {overview && viewStatus === 'ready' && <CancelamentosView overview={overview} />}
    </div>
  );
}
