'use client';

import { useState } from 'react';
import type { CommercialMetrics, CommercialRecord } from '@/lib/analytics/commercial-ixc';
import { formatDay, ixcFilterControl, IxcMetricComparison, IxcMetricStatus, IxcPeriodPanel, type IxcPeriodData } from './ixc-period-panel';

const metrics = [
  { id: 'leads', label: 'Leads recebidos', detail: 'Contatos cadastrados no IXC' },
  { id: 'sales', label: 'Vendas fechadas', detail: 'Negociações pela data de vitória' },
  { id: 'contracts', label: 'Contratos criados', detail: 'Contratos pela data de cadastro no IXC' },
] as const;

const pageSize = 25;
const numbers = new Intl.NumberFormat('pt-BR');

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

type MetricId = (typeof metrics)[number]['id'];

export function CommercialView() {
  const [selected, setSelected] = useState<MetricId>('leads');
  return (
    <IxcPeriodPanel<CommercialMetrics> title="Vendas" description="Leads, vendas e contratos criados no IXC.">
      {(data) => <CommercialDetails data={data} selected={selected} setSelected={setSelected} />}
    </IxcPeriodPanel>
  );
}

function CommercialDetails({ data, selected, setSelected }: {
  data: IxcPeriodData<CommercialMetrics>;
  selected: MetricId;
  setSelected: (metric: MetricId) => void;
}) {
  const [channel, setChannel] = useState('');
  const [responsible, setResponsible] = useState('');
  const [page, setPage] = useState(1);

  const current = data.metrics[selected];
  const missingNames = current?.some(row => (row.channel && !row.channelName) || (row.responsible && !row.responsibleName));
  const channelOptions = options(current ?? [], 'channel');
  const responsibleOptions = options(current ?? [], 'responsible');
  const activeChannel = channelOptions.some(([id]) => id === channel) ? channel : '';
  const activeResponsible = responsibleOptions.some(([id]) => id === responsible) ? responsible : '';
  const filtered = current?.filter((row) =>
    (!activeChannel || row.channel === activeChannel)
    && (!activeResponsible || row.responsible === activeResponsible)) ?? [];
  const selectedLabel = metrics.find(({ id }) => id === selected)?.label;
  const responsibleLabel = selected === 'contracts' ? 'Vendedor' : 'Responsável';
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, lastPage);

  function resetDetail() {
    setChannel('');
    setResponsible('');
    setPage(1);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Totais do período">
        {metrics.map(({ id, label, detail }) => {
          const records = data.metrics[id];
          const timestamp = data.timestamps[id];
          return (
            <button key={id} type="button" aria-pressed={selected === id}
              onClick={() => { setSelected(id); resetDetail(); }}
              className={'rounded-xl border bg-[var(--app-panel)] p-4 text-left outline-offset-2 focus-visible:outline-2 '
                + (selected === id ? 'border-amber-500 ring-1 ring-amber-500' : 'border-[var(--app-border)]')}>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="my-1 block text-2xl font-bold tabular-nums">{records ? numbers.format(records.length) : '—'}</span>
              <span className="block text-xs text-[var(--app-muted)]">{detail}</span>
              <IxcMetricComparison current={timestamp === data.readAt ? records?.length : undefined}
                previous={data.comparison[id]} loading={data.comparisonLoading} />
              <IxcMetricStatus timestamp={timestamp} readAt={data.readAt} loading={data.loading} />
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
                  <select className={ixcFilterControl} value={activeChannel} onChange={(event) => { setChannel(event.target.value); setPage(1); }}>
                    <option value="">Todos</option>
                    {channelOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm">
                {responsibleLabel}
                <select className={ixcFilterControl} value={activeResponsible} onChange={(event) => { setResponsible(event.target.value); setPage(1); }}>
                  <option value="">Todos</option>
                  {responsibleOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
        {missingNames && <p className="border-b border-[var(--app-border)] px-4 py-2 text-xs text-[var(--app-muted)]">
          Alguns nomes de canais ou responsáveis estão indisponíveis no IXC. O total de registros está disponível.
        </p>}
        {!filtered.length ? (
          <p className="p-4 text-sm text-[var(--app-muted)]">{current ? 'Nenhum registro neste recorte.'
            : data.loading ? 'Aguardando a consulta do IXC.' : 'Este indicador não pôde ser carregado. Consulte o período novamente.'}</p>
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
                {filtered.slice((visiblePage - 1) * pageSize, visiblePage * pageSize).map((row) => (
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
            <button type="button" disabled={visiblePage === 1} className="underline disabled:opacity-40" onClick={() => setPage(visiblePage - 1)}>Anterior</button>
            <span>Página {visiblePage} de {lastPage}</span>
            <button type="button" disabled={visiblePage === lastPage} className="underline disabled:opacity-40" onClick={() => setPage(visiblePage + 1)}>Próxima</button>
          </div>
        )}
      </section>
    </>
  );
}
