'use client';

import { CalendarDays, Database, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { AnalyticsOverviewResponse } from '@/lib/analytics/response';
import {
  ANALYTICS_TABS,
  isAnalyticsTabId,
  type AnalyticsTabId,
} from '@/lib/analytics/navigation';

import { AtendimentoView } from './atendimento-view';
import { CancelamentosView } from './cancelamentos-view';
import { GeralView } from './geral-view';
import { AnalyticsUnavailable } from './analytics-primitives';

type ViewStatus = 'loading' | 'ready' | 'unavailable' | 'error';

const BUSINESS_TIMEZONE = 'America/Sao_Paulo';

function localDateToBoundary(value: string, endOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}-03:00`;
}

function formatDate(value: string | null): string {
  if (!value) return 'Ainda não sincronizado';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: BUSINESS_TIMEZONE,
  }).format(timestamp);
}

function statusLabel(status: ViewStatus | AnalyticsOverviewResponse['meta']['status']): string {
  switch (status) {
    case 'ready':
    case 'success':
      return 'Cobertura confirmada';
    case 'partial':
      return 'Cobertura parcial';
    case 'loading':
      return 'Consultando fontes';
    case 'error':
    case 'failed':
      return 'Falha de leitura';
    case 'unavailable':
    default:
      return 'Fonte indisponível';
  }
}

function statusClasses(status: ViewStatus | AnalyticsOverviewResponse['meta']['status']): string {
  switch (status) {
    case 'ready':
    case 'success':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
    case 'partial':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-200';
    case 'loading':
      return 'border-blue-400/20 bg-blue-400/10 text-blue-200';
    default:
      return 'border-rose-400/20 bg-rose-400/10 text-rose-200';
  }
}

export function AnalyticsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [fromDate, setFromDate] = useState(searchParams.get('analyticsFrom') ?? '');
  const [toDate, setToDate] = useState(searchParams.get('analyticsTo') ?? '');
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [viewStatus, setViewStatus] = useState<ViewStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeTab: AnalyticsTabId = isAnalyticsTabId(searchParams.get('indicadores'))
    ? searchParams.get('indicadores') as AnalyticsTabId
    : 'geral';

  const setActiveTab = useCallback((tab: AnalyticsTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'indicadores');
    params.set('indicadores', tab);
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

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

  const currentStatus = overview?.meta.status ?? viewStatus;
  const coverageLabel = overview ? `${Math.round(overview.meta.coverage * 100)}%` : '—';
  const updateLabel = overview ? formatDate(overview.meta.lastUpdatedAt) : 'Ainda não sincronizado';

  const page = useMemo(() => {
    if (!overview || viewStatus !== 'ready') return null;
    switch (activeTab) {
      case 'atendimento':
        return <AtendimentoView overview={overview} />;
      case 'cancelamentos':
        return <CancelamentosView overview={overview} />;
      case 'geral':
      default:
        return <GeralView overview={overview} />;
    }
  }, [activeTab, overview, viewStatus]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-amber-400">Indique e Ganhe / centro de indicadores</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">Leitura operacional</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Três visões do mesmo contrato de dados, com a origem e a cobertura expostas na tela.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={viewStatus === 'loading'}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-amber-400/40 hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B] disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${viewStatus === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          Atualizar leitura
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

      <section className="grid gap-3 border-l-2 border-amber-400/80 bg-gradient-to-r from-amber-400/[0.08] to-transparent px-4 py-3 md:grid-cols-[1.4fr_1fr_0.7fr_auto] md:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-400/10 p-2 text-amber-300 ring-1 ring-amber-400/20">
            <Database className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Proveniência da leitura</p>
            <p className="mt-1 text-xs text-zinc-500">Opa! Suite + IXC + dados do Indique e Ganhe</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">Última atualização</p>
          <p className="mt-1 text-xs font-semibold text-zinc-300">{updateLabel}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">Cobertura</p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-zinc-300">{coverageLabel}</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${statusClasses(currentStatus)}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {statusLabel(currentStatus)}
        </span>
      </section>

      <nav className="grid gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-2 md:grid-cols-3" aria-label="Abas de indicadores">
        {ANALYTICS_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={`group rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${active
                ? 'border-amber-400/40 bg-amber-400/10 shadow-[0_8px_30px_rgba(251,191,36,0.08)]'
                : 'border-transparent hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              <span className={`block text-[10px] font-bold tracking-[0.18em] ${active ? 'text-amber-300' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{tab.label}</span>
              <span className="mt-1 block text-xs text-zinc-600">{tab.description}</span>
            </button>
          );
        })}
      </nav>

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

      {page}
    </div>
  );
}
