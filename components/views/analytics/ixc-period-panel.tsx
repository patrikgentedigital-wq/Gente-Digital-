'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CommercialPeriod } from '@/lib/analytics/commercial-ixc';
import { startIxcRefresh } from '@/lib/analytics/ixc-refresh';

export const ixcFilterControl = 'block w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm outline-offset-2 focus-visible:outline-2';
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
});
const businessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' });

function defaultPeriod(): CommercialPeriod {
  const today = Date.parse(businessDay.format(new Date()));
  const day = (offset: number) => new Date(today - offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(28), to: day(1) };
}

export function formatDay(value: string) {
  return value.split('-').reverse().join('/');
}

interface IxcPeriodPanelProps<Metrics> {
  title: string;
  description: string;
  section?: 'cancelamentos';
  children: (metrics: Metrics) => ReactNode;
}

export function IxcPeriodPanel<Metrics>({ title, description, section, children }: IxcPeriodPanelProps<Metrics>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState(() => {
    const from = searchParams.get('analyticsFrom');
    const to = searchParams.get('analyticsTo');
    return from && to ? { from, to } : defaultPeriod();
  });
  const [request, setRequest] = useState(() => ({ period, attempt: 0 }));
  const [result, setResult] = useState<{ metrics: Metrics; readAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams({ ...request.period });
    if (section) params.set('section', section);

    return startIxcRefresh(async (signal) => {
      try {
        const response = await fetch('/api/analytics/commercial?' + params, {
          cache: 'no-store', signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o IXC.');
        if (!signal.aborted) {
          setResult(payload);
          setError(null);
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o IXC.');
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    });
  }, [request, section]);

  return (
    <section className="space-y-6 text-[var(--app-ink)]" aria-labelledby="ixc-period-title">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ixc-period-title" className="font-display text-3xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-[var(--app-muted)]">{description}</p>
        </div>
        <div className="text-xs text-[var(--app-muted)]">
          <p>Atualização automática a cada hora</p>
          {result && <p>Última consulta em {dateTime.format(new Date(result.readAt))}</p>}
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setResult(null);
          setLoading(true);
          setRequest((previous) => ({ period, attempt: previous.attempt + 1 }));
          const params = new URLSearchParams(searchParams);
          params.set('analyticsFrom', period.from);
          params.set('analyticsTo', period.to);
          router.replace(pathname + '?' + params, { scroll: false });
        }}>
        <label className="space-y-1 text-sm font-medium">
          <span>De</span>
          <input type="date" required value={period.from} max={period.to || undefined} className={ixcFilterControl}
            onChange={(event) => setPeriod({ ...period, from: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Até</span>
          <input type="date" required value={period.to} min={period.from || undefined} className={ixcFilterControl}
            onChange={(event) => setPeriod({ ...period, to: event.target.value })} />
        </label>
        <button type="submit" className="rounded-lg bg-[#ffe300] px-4 py-2 text-sm font-bold text-[#0e1b2c] outline-offset-2 focus-visible:outline-2">
          Consultar período
        </button>
        <p className="self-center text-xs text-[var(--app-muted)]">Até 92 dias por consulta</p>
      </form>

      {loading && <p role="status" className="text-sm text-[var(--app-muted)]">Consultando o IXC…</p>}
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/40 p-4 text-sm">
          {result ? 'A atualização falhou. Exibindo os dados da última consulta.' : error}
        </p>
      )}
      {result && (
        <>
          <p className="text-sm font-medium">Período consultado: {formatDay(request.period.from)} a {formatDay(request.period.to)}</p>
          {children(result.metrics)}
        </>
      )}
    </section>
  );
}
