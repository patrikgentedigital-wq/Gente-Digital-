'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CommercialPeriod } from '@/lib/analytics/commercial-ixc';
import type { CommercialDailyTotals } from '@/lib/analytics/commercial-panorama';
import { businessToday, comparisonPeriod, presetPeriod, saveIxcSnapshot, type IxcSnapshot, type PeriodPreset } from '@/lib/analytics/ixc-period';
import { startIxcRefresh } from '@/lib/analytics/ixc-refresh';
import { IndicatorTabs } from './indicator-tabs';
import { IndicatorReportAction } from './indicator-report-action';

export const ixcFilterControl = 'block w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm outline-offset-2 focus-visible:outline-2';

export function formatDay(value: string) {
  return value.split('-').reverse().join('/');
}

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
});
const count = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const presets = [
  ['this-month', 'Este mês'],
  ['previous-month', 'Mês passado'],
  ['last-seven', 'Últimos 7 dias'],
] as const;

type Comparison<Metrics> = Partial<Record<keyof Metrics, number | null>>;

type DisplayedPeriod<Metrics> = {
  period: CommercialPeriod;
  compared: CommercialPeriod | null;
  readAt: string | null;
  comparisonLoading: boolean;
  comparison: Comparison<Metrics>;
  series?: CommercialDailyTotals;
};

export interface IxcPeriodData<Metrics> {
  periodKey: string;
  period: CommercialPeriod;
  metrics: Partial<Metrics>;
  timestamps: IxcSnapshot<Metrics>['timestamps'];
  readAt: string | null;
  loading: boolean;
  compared: CommercialPeriod | null;
  comparisonLoading: boolean;
  comparison: Comparison<Metrics>;
  series?: CommercialDailyTotals;
}

function defaultPeriod(): CommercialPeriod {
  const today = Date.parse(businessToday());
  const day = (offset: number) => new Date(today - offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(28), to: day(1) };
}

function keyOf(period: CommercialPeriod) {
  return period.from + '/' + period.to;
}

function periodLabel(period: CommercialPeriod) {
  return formatDay(period.from) + ' a ' + formatDay(period.to);
}

export function IxcMetricStatus({ timestamp, loading }: { timestamp?: string; loading: boolean }) {
  const label = timestamp ? 'Última leitura disponível' : loading ? 'Consultando o IXC' : 'Indisponível';
  return <span className="mt-1 block text-xs text-[var(--app-muted)]">
    {label}{timestamp && <> em <time dateTime={timestamp}>{dateTime.format(new Date(timestamp))}</time></>}
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
  return <span className="block tabular-nums">{label}</span>;
}

async function readIxcPeriod<Metrics>(period: CommercialPeriod, section: IxcSection | undefined, signal: AbortSignal, summary = false) {
  const params = new URLSearchParams({ ...period });
  if (section) params.set('section', section);
  if (summary) params.set('summary', '1');
  const response = await fetch('/api/analytics/commercial?' + params, { cache: 'no-store', signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o IXC.');
  return payload as { metrics: Metrics; readAt: string; series?: CommercialDailyTotals };
}

const consultClass = 'ix-consult';

type IxcSection = 'cancelamentos';

interface IxcPeriodPanelProps<Metrics> {
  title: string;
  description: string;
  section?: IxcSection;
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
  const [request, setRequest] = useState(() => ({
    period, compared: comparisonPeriod(period, businessToday()), attempt: 0,
  }));
  const [displayed, setDisplayed] = useState<DisplayedPeriod<Metrics>>(() => ({
    period, compared: request.compared, readAt: null, comparisonLoading: false, comparison: {},
  }));
  const [snapshots, setSnapshots] = useState<Record<string, IxcSnapshot<Metrics>>>({});
  const [customOpen, setCustomOpen] = useState(false);
  const periodMenu = useRef<HTMLDetailsElement>(null);
  function closePeriodMenu() {
    const menu = periodMenu.current;
    if (menu?.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus({ preventScroll: true });
    }
  }
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const periodKey = keyOf(request.period);
  const displayedKey = keyOf(displayed.period);
  const snapshot = snapshots[displayedKey];
  const samePeriod = periodKey === displayedKey;
  const reference = snapshot ? displayed : request;

  useEffect(() => startIxcRefresh(async (signal) => {
    setLoading(true);
    setError(null);
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
      setDisplayed({
        period: request.period, compared: request.compared, readAt: payload.readAt,
        comparison: {}, comparisonLoading: Boolean(request.compared),
      });
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o IXC.');
      return;
    } finally {
      if (!signal.aborted) setLoading(false);
    }

    if (!request.compared || signal.aborted) return;
    try {
      const payload = await readIxcPeriod<Comparison<Metrics>>(request.compared, section, signal, true);
      if (!signal.aborted) setDisplayed(current => ({ ...current, comparison: payload.metrics, series: payload.series }));
    } catch {
      // The main reading is still usable if the comparison is unavailable.
    } finally {
      if (!signal.aborted) setDisplayed(current => ({ ...current, comparisonLoading: false }));
    }
  }), [request, periodKey, section]);

  function consult(next: CommercialPeriod) {
    const compared = comparisonPeriod(next, businessToday());
    if (!compared) {
      setFormError('Informe um período válido de até 92 dias.');
      setCustomOpen(true);
      return;
    }
    closePeriodMenu();
    setDisplayed(current => current.comparisonLoading ? { ...current, comparisonLoading: false } : current);
    setPeriod(next);
    setFormError(null);
    setError(null);
    setLoading(true);
    setRequest(previous => ({ period: next, compared, attempt: previous.attempt + 1 }));
    const params = new URLSearchParams(searchParams);
    params.set('analyticsFrom', next.from);
    params.set('analyticsTo', next.to);
    router.replace(pathname + '?' + params, { scroll: false });
  }

  function choosePreset(preset: PeriodPreset) {
    setCustomOpen(false);
    consult(presetPeriod(preset, businessToday()));
  }

  const today = businessToday();
  const readAt = samePeriod && error ? null : displayed.readAt;
  return (
    <section className="ix-period" aria-labelledby="ixc-period-title">
      <header className="ix-page-head">
        <div>
          <h2 id="ixc-period-title">{title}</h2>
          <p>{description}</p>
        </div>
        <div className="ix-period-actions">
          <details ref={periodMenu} className="ix-period-menu"
            onKeyDown={event => { if (event.key === 'Escape') closePeriodMenu(); }}
            onBlur={event => {
              if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
                event.currentTarget.open = false;
              }
            }}>
            <summary><CalendarDays size={16} aria-hidden="true" /><span>{periodLabel(reference.period)}</span><ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="ix-period-popup">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Atalhos de período">
                  {presets.map(([id, label]) => {
                    const active = keyOf(presetPeriod(id, today)) === keyOf(reference.period);
                    return (
                      <button key={id} type="button" aria-pressed={active} onClick={() => choosePreset(id)}
                        className={'min-h-9 rounded-lg border px-2.5 text-sm font-medium outline-offset-2 focus-visible:outline-2 '
                          + (active ? 'border-[var(--app-border)] bg-[var(--app-panel-muted)]' : 'border-[var(--app-border)] hover:border-[var(--app-muted)]')}>
                        {label}
                      </button>
                    );
                  })}
                  <button type="button" aria-expanded={customOpen} aria-controls="commercial-custom-period"
                    onClick={() => setCustomOpen(open => !open)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--app-border)] px-2.5 text-sm font-medium outline-offset-2 hover:border-[var(--app-muted)] focus-visible:outline-2">
                    Personalizado <ChevronDown size={14} aria-hidden="true" className={customOpen ? 'rotate-180' : undefined} />
                  </button>
                </div>
                {!customOpen && (
                  <button type="button" className={consultClass} onClick={() => consult(request.period)}>Consultar período</button>
                )}
              </div>
              <div id="commercial-custom-period" hidden={!customOpen}>
                <form className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--app-border)] pt-3"
                  onSubmit={event => { event.preventDefault(); consult(period); }}>
                  <label className="space-y-1 text-xs font-medium">
                    <span>De</span>
                    <input type="date" required value={period.from} max={period.to || undefined} className={ixcFilterControl}
                      onChange={event => { setPeriod({ ...period, from: event.target.value }); setFormError(null); }} />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    <span>Até</span>
                    <input type="date" required value={period.to} min={period.from || undefined} className={ixcFilterControl}
                      onChange={event => { setPeriod({ ...period, to: event.target.value }); setFormError(null); }} />
                  </label>
                  <button type="submit" className={consultClass}>Consultar período</button>
                  <p className="self-center text-xs text-[var(--app-muted)]">Até 92 dias por consulta</p>
                </form>
                {formError && <p role="alert" className="mt-2 text-sm font-medium">{formError}</p>}
              </div>
            </div>
          </details>
          <IndicatorReportAction key={keyOf(reference.period)} period={reference.period} disabled={loading && (!snapshot || !samePeriod)} />
        </div>
      </header>
      <IndicatorTabs cancellation={section === 'cancelamentos'} />
      <div className="ix-read-status">
        <div>
          <p>{snapshot ? 'Exibindo ' : 'Período selecionado '}{periodLabel(reference.period)}</p>
          {(snapshot || loading) && reference.compared && (
            <p>Comparação com {periodLabel(reference.compared)}</p>
          )}
        </div>
        <div>
          <p>Atualização a cada hora</p>
          <p role="status">
            {loading ? (snapshot && !samePeriod ? 'Consultando ' + periodLabel(request.period) : 'Consultando o IXC…')
              : displayed.readAt && <>Última leitura do IXC em <time dateTime={displayed.readAt}>{dateTime.format(new Date(displayed.readAt))}</time></>}
          </p>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/40 px-4 py-2.5 text-sm">
        {snapshot ? 'A consulta de ' + periodLabel(request.period) + ' falhou. Os dados exibidos são da última leitura disponível.' : error}
      </p>}
      {children({
        periodKey: snapshot ? displayedKey : periodKey,
        period: reference.period,
        metrics: snapshot?.metrics ?? {},
        timestamps: snapshot?.timestamps ?? {},
        readAt, loading: loading && (samePeriod || !snapshot), compared: reference.compared,
        comparisonLoading: displayed.comparisonLoading || (!snapshot && loading),
        comparison: displayed.comparison,
        series: displayed.series,
      })}
    </section>
  );
}
