'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CommercialPeriod } from '@/lib/analytics/commercial-ixc';
import { businessToday, comparisonPeriod, presetPeriod, saveIxcSnapshot, type IxcSnapshot, type PeriodPreset } from '@/lib/analytics/ixc-period';
import { startIxcRefresh } from '@/lib/analytics/ixc-refresh';

export const ixcFilterControl = 'block w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm outline-offset-2 focus-visible:outline-2';
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' });
const count = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const presets = [
  ['this-month', 'Este mês'],
  ['previous-month', 'Mês passado'],
  ['last-seven', 'Últimos 7 dias'],
] as const;

function defaultPeriod(): CommercialPeriod {
  const today = Date.parse(businessToday());
  const day = (offset: number) => new Date(today - offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(28), to: day(1) };
}

export function formatDay(value: string) {
  return value.split('-').reverse().join('/');
}

export interface IxcPeriodData<Metrics> {
  metrics: Partial<Metrics>;
  timestamps: IxcSnapshot<Metrics>['timestamps'];
  readAt: string | null;
  loading: boolean;
  comparisonLoading: boolean;
  comparison: Partial<Record<keyof Metrics, number | null>>;
}

export function IxcMetricStatus({ timestamp, readAt, loading }: {
  timestamp?: string;
  readAt: string | null;
  loading: boolean;
}) {
  const label = loading ? (timestamp ? 'Atualizando · última leitura' : 'Consultando o IXC')
    : timestamp ? (timestamp === readAt ? 'Atualizado' : 'Última leitura disponível') : 'Indisponível';
  return <span className="block text-xs text-[var(--app-muted)]">
    {label}{timestamp && <> · <time dateTime={timestamp}>{dateTime.format(new Date(timestamp))}</time></>}
  </span>;
}

export function IxcMetricComparison({ current, previous, loading }: {
  current?: number;
  previous?: number | null;
  loading: boolean;
}) {
  let label = 'Comparação indisponível';
  if (loading) label = 'Consultando comparação…';
  else if (current !== undefined && previous != null) {
    const difference = current - previous;
    label = difference === 0 ? 'Sem variação'
      : previous === 0 ? count.format(difference) + ' ante 0 no período anterior'
        : percent.format(difference / previous) + ' vs. período anterior';
  }
  return <span className="mt-2 block text-sm font-semibold tabular-nums">{label}</span>;
}

async function readIxcPeriod<Metrics>(period: CommercialPeriod, section: string | undefined, signal: AbortSignal, summary = false) {
  const params = new URLSearchParams({ ...period });
  if (section) params.set('section', section);
  if (summary) params.set('summary', '1');
  const response = await fetch('/api/analytics/commercial?' + params, { cache: 'no-store', signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o IXC.');
  return payload as { metrics: Metrics; readAt: string };
}

interface IxcPeriodPanelProps<Metrics> {
  title: string;
  description: string;
  section?: 'cancelamentos';
  children: (data: IxcPeriodData<Metrics>) => ReactNode;
}

export function IxcPeriodPanel<Metrics extends object>({ title, description, section, children }: IxcPeriodPanelProps<Metrics>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState(() => {
    const from = searchParams.get('analyticsFrom');
    const to = searchParams.get('analyticsTo');
    return from && to ? { from, to } : defaultPeriod();
  });
  const [request, setRequest] = useState(() => ({ period, comparison: comparisonPeriod(period, businessToday()), attempt: 0 }));
  const [snapshots, setSnapshots] = useState<Record<string, IxcSnapshot<Metrics>>>({});
  const [readAt, setReadAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparison, setComparison] = useState<IxcPeriodData<Metrics>['comparison']>({});
  const periodKey = request.period.from + '/' + request.period.to;
  const snapshot = snapshots[periodKey];

  useEffect(() => startIxcRefresh(async (signal) => {
    setLoading(true);
    setError(null);
    setComparison({});
    setComparisonLoading(false);
    try {
      const payload = await readIxcPeriod<Metrics>(request.period, section, signal);
      if (signal.aborted) return;
      setSnapshots(previous => {
        const next = { ...previous };
        const saved = saveIxcSnapshot(next[periodKey], payload.metrics, payload.readAt);
        delete next[periodKey];
        next[periodKey] = saved;
        const keys = Object.keys(next);
        if (keys.length > 8) delete next[keys[0]];
        return next;
      });
      setReadAt(payload.readAt);
    } catch (cause) {
      if (!signal.aborted) {
        setReadAt(null);
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o IXC.');
      }
      return;
    } finally {
      if (!signal.aborted) setLoading(false);
    }

    if (!request.comparison || signal.aborted) return;
    setComparisonLoading(true);
    try {
      const payload = await readIxcPeriod<IxcPeriodData<Metrics>['comparison']>(request.comparison, section, signal, true);
      if (!signal.aborted) setComparison(payload.metrics);
    } catch {
      // The main reading is still usable if the comparison is unavailable.
    } finally {
      if (!signal.aborted) setComparisonLoading(false);
    }
  }), [request, section, periodKey]);

  function consult(next: CommercialPeriod) {
    setPeriod(next);
    setError(null);
    setReadAt(null);
    setLoading(true);
    setComparison({});
    setComparisonLoading(false);
    setRequest(previous => ({ period: next, comparison: comparisonPeriod(next, businessToday()), attempt: previous.attempt + 1 }));
    const params = new URLSearchParams(searchParams);
    params.set('analyticsFrom', next.from);
    params.set('analyticsTo', next.to);
    router.replace(pathname + '?' + params, { scroll: false });
  }

  function choosePreset(preset: PeriodPreset) {
    consult(presetPeriod(preset, businessToday()));
  }

  const today = businessToday();
  return (
    <section className="space-y-5 text-[var(--app-ink)]" aria-labelledby="ixc-period-title">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ixc-period-title" className="font-display text-3xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-[var(--app-muted)]">{description}</p>
        </div>
        <p className="text-xs text-[var(--app-muted)]">Atualização automática a cada hora</p>
      </header>

      <div className="space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <div className="flex flex-wrap gap-2" aria-label="Atalhos de período">
          {presets.map(([id, label]) => {
            const shortcut = presetPeriod(id, today);
            const active = shortcut.from === period.from && shortcut.to === period.to;
            return <button key={id} type="button" aria-pressed={active} onClick={() => choosePreset(id)}
              className={'rounded-lg border px-3 py-1.5 text-sm font-medium outline-offset-2 focus-visible:outline-2 '
                + (active ? 'border-[#ffe300] bg-[#ffe300]/20' : 'border-[var(--app-border)]')}>{label}</button>;
          })}
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); consult(period); }}>
          <label className="space-y-1 text-sm font-medium">
            <span>De</span>
            <input type="date" required value={period.from} max={period.to || undefined} className={ixcFilterControl}
              onChange={event => setPeriod({ ...period, from: event.target.value })} />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Até</span>
            <input type="date" required value={period.to} min={period.from || undefined} className={ixcFilterControl}
              onChange={event => setPeriod({ ...period, to: event.target.value })} />
          </label>
          <button type="submit" className="rounded-lg bg-[#ffe300] px-4 py-2 text-sm font-bold text-[#0e1b2c] outline-offset-2 focus-visible:outline-2">
            Consultar período
          </button>
          <p className="self-center text-xs text-[var(--app-muted)]">Até 92 dias por consulta</p>
        </form>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">Período consultado: {formatDay(request.period.from)} a {formatDay(request.period.to)}</p>
        {request.comparison && <p className="text-xs text-[var(--app-muted)]">
          Comparação: {formatDay(request.comparison.from)} a {formatDay(request.comparison.to)}
        </p>}
      </div>
      {loading && <p role="status" className="text-sm text-[var(--app-muted)]">Consultando o IXC…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-500/40 p-4 text-sm">
        {snapshot ? 'A atualização falhou. Exibindo as últimas leituras disponíveis deste período.' : error}
      </p>}
      {children({
        metrics: snapshot?.metrics ?? {},
        timestamps: snapshot?.timestamps ?? {},
        readAt, loading, comparisonLoading, comparison,
      })}
    </section>
  );
}
