'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CommercialMetrics, CommercialPeriod, CommercialRecord } from '@/lib/analytics/commercial-ixc';

const metrics = [
  { id: 'leads', label: 'Leads recebidos', detail: 'Contatos cadastrados no IXC' },
  { id: 'sales', label: 'Vendas fechadas', detail: 'Negociações pela data de vitória' },
  { id: 'contracts', label: 'Contratos criados', detail: 'Contratos pela data de cadastro no IXC' },
] as const;

const pageSize = 25;
const control = 'block w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm outline-offset-2 focus-visible:outline-2';
const numbers = new Intl.NumberFormat('pt-BR');
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
});
const businessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' });

function defaultPeriod(): CommercialPeriod {
  const today = Date.parse(businessDay.format(new Date()));
  const day = (offset: number) => new Date(today - offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(28), to: day(1) };
}

function formatDay(value: string) {
  return value.split('-').reverse().join('/');
}

type NameField = 'channel' | 'responsible';

function displayName(row: CommercialRecord, field: NameField): string {
  const name = field === 'channel' ? row.channelName : row.responsibleName;
  const id = row[field];
  return name ?? (id ? 'Nome indisponível (ref. ' + id + ')' : '—');
}

function options(records: readonly CommercialRecord[], field: NameField) {
  const labels = new Map<string, string>();
  for (const row of records) {
    const id = row[field];
    if (id) labels.set(id, displayName(row, field));
  }
  return [...labels.entries()].sort((left, right) =>
    left[1].localeCompare(right[1], 'pt-BR', { numeric: true }));
}

type CommercialResult = { metrics: CommercialMetrics; readAt: string };

export function CommercialView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState(() => {
    const from = searchParams.get('analyticsFrom');
    const to = searchParams.get('analyticsTo');
    return from && to ? { from, to } : defaultPeriod();
  });
  const [request, setRequest] = useState(() => ({ period, attempt: 0 }));
  const [result, setResult] = useState<CommercialResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<(typeof metrics)[number]['id']>('leads');
  const [channel, setChannel] = useState('');
  const [responsible, setResponsible] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ...request.period });
    void (async () => {
      try {
        const response = await fetch('/api/analytics/commercial?' + params, {
          cache: 'no-store', signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o IXC.');
        if (!controller.signal.aborted) setResult(payload);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o IXC.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [request]);

  const current = result?.metrics[selected];
  const filtered = current?.filter((row) =>
    (!channel || row.channel === channel) && (!responsible || row.responsible === responsible)) ?? [];
  const selectedLabel = metrics.find(({ id }) => id === selected)?.label;
  const responsibleLabel = selected === 'contracts' ? 'Vendedor' : 'Responsável';
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));

  function resetDetail() {
    setChannel('');
    setResponsible('');
    setPage(1);
  }

  return (
    <section className="space-y-6 text-[var(--app-ink)]" aria-labelledby="commercial-title">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="commercial-title" className="font-display text-3xl font-bold tracking-tight">Comercial</h2>
          <p className="mt-1 text-sm text-[var(--app-muted)]">Leads, vendas e contratos criados no IXC.</p>
        </div>
        {result && <p className="text-xs text-[var(--app-muted)]">Consultado em {dateTime.format(new Date(result.readAt))}</p>}
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setResult(null);
          setLoading(true);
          resetDetail();
          setRequest((previous) => ({ period, attempt: previous.attempt + 1 }));
          const params = new URLSearchParams(searchParams);
          params.set('analyticsFrom', period.from);
          params.set('analyticsTo', period.to);
          router.replace(pathname + '?' + params, { scroll: false });
        }}>
        <label className="space-y-1 text-sm font-medium">
          <span>De</span>
          <input type="date" required value={period.from} max={period.to || undefined} className={control}
            onChange={(event) => setPeriod({ ...period, from: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Até</span>
          <input type="date" required value={period.to} min={period.from || undefined} className={control}
            onChange={(event) => setPeriod({ ...period, to: event.target.value })} />
        </label>
        <button type="submit" className="rounded-lg bg-[#ffe300] px-4 py-2 text-sm font-bold text-[#0e1b2c] outline-offset-2 focus-visible:outline-2">
          Consultar período
        </button>
        <p className="self-center text-xs text-[var(--app-muted)]">Até 92 dias por consulta</p>
      </form>

      {loading && <p role="status" className="text-sm text-[var(--app-muted)]">Consultando o IXC…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-500/40 p-4 text-sm">{error}</p>}
      {result && (
        <>
          <p className="text-sm font-medium">Período consultado: {formatDay(request.period.from)} a {formatDay(request.period.to)}</p>
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Totais do período">
            {metrics.map(({ id, label, detail }) => {
              const records = result.metrics[id];
              return (
                <button key={id} type="button" aria-pressed={selected === id}
                  onClick={() => { setSelected(id); resetDetail(); }}
                  className={'rounded-xl border bg-[var(--app-panel)] p-4 text-left outline-offset-2 focus-visible:outline-2 '
                    + (selected === id ? 'border-amber-500 ring-1 ring-amber-500' : 'border-[var(--app-border)]')}>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="my-1 block text-2xl font-bold tabular-nums">{records ? numbers.format(records.length) : 'Indisponível'}</span>
                  <span className="block text-xs text-[var(--app-muted)]">{detail}</span>
                </button>
              );
            })}
          </div>

          <section aria-labelledby="commercial-detail" className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--app-border)] p-4">
              <div>
                <h3 id="commercial-detail" className="font-semibold">{selectedLabel}</h3>
                {current && <p className="text-xs text-[var(--app-muted)]">{numbers.format(filtered.length)} de {numbers.format(current.length)} registros</p>}
              </div>
              {current && current.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {selected !== 'contracts' && (
                    <label className="text-sm">
                      Canal
                      <select className={control} value={channel} onChange={(event) => { setChannel(event.target.value); setPage(1); }}>
                        <option value="">Todos</option>
                        {options(current, 'channel').map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="text-sm">
                    {responsibleLabel}
                    <select className={control} value={responsible} onChange={(event) => { setResponsible(event.target.value); setPage(1); }}>
                      <option value="">Todos</option>
                      {options(current, 'responsible').map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
            {!filtered.length ? (
              <p className="p-4 text-sm text-[var(--app-muted)]">{current ? 'Nenhum registro neste recorte.' : 'Este indicador não pôde ser carregado. Consulte o período novamente.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--app-canvas)]">
                    <tr>
                      <th scope="col" className="px-4 py-2">ID no IXC</th>
                      <th scope="col" className="px-4 py-2">Data</th>
                      {selected !== 'contracts' && <th scope="col" className="px-4 py-2">Canal</th>}
                      <th scope="col" className="px-4 py-2">{responsibleLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map((row) => (
                      <tr key={row.id} className="border-t border-[var(--app-border)] tabular-nums">
                        <td className="px-4 py-2">{row.id}</td>
                        <td className="px-4 py-2">{formatDay(row.date)}</td>
                        {selected !== 'contracts' && <td className="px-4 py-2">{displayName(row, 'channel')}</td>}
                        <td className="px-4 py-2">{displayName(row, 'responsible')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lastPage > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] p-4 text-sm">
                <button type="button" disabled={page === 1} className="underline disabled:opacity-40" onClick={() => setPage(page - 1)}>Anterior</button>
                <span>Página {page} de {lastPage}</span>
                <button type="button" disabled={page === lastPage} className="underline disabled:opacity-40" onClick={() => setPage(page + 1)}>Próxima</button>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
