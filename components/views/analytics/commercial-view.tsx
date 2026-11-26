'use client';

import { Activity, ArrowDown, ArrowUp, FileText, Target, Users } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sortCommercialRecordsByDate, type CommercialDateOrder } from '@/lib/analytics/commercial-detail';
import type { CommercialMetrics, CommercialRecord } from '@/lib/analytics/commercial-ixc';
import { commercialTrendBuckets, countCommercialDays } from '@/lib/analytics/commercial-panorama';
import { CommercialTrend, type TrendBucket } from './commercial-trend';
import { IndicatorMetric } from './indicator-metric';
import { IndicatorDistribution } from './indicator-distribution';
import { formatDay, ixcFilterControl, IxcMetricComparison, IxcMetricStatus, IxcPeriodPanel, type IxcPeriodData } from './ixc-period-panel';

const metrics = [
  { id: 'leads', icon: Users, label: 'Leads recebidos', detail: 'Contatos cadastrados no IXC' },
  { id: 'sales', icon: Target, label: 'Vendas fechadas', detail: 'Negociações pela data de vitória' },
  { id: 'contracts', icon: FileText, label: 'Contratos criados', detail: 'Contratos pela data de cadastro no IXC' },
] as const;

const pageSize = 25;
const numbers = new Intl.NumberFormat('pt-BR');
const dailyAverage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

type NameField = 'channel' | 'responsible';

function displayName(row: CommercialRecord, field: NameField): string {
  const name = field === 'channel' ? row.channelName : row.responsibleName;
  const id = row[field];
  return name ?? (id ? 'Nome indisponível (ref. ' + id + ')' : '—');
}

const unassigned = 'unassigned';

function groupKey(row: CommercialRecord, field: NameField) {
  return row[field] ?? unassigned;
}

function groups(records: readonly CommercialRecord[], field: NameField) {
  const counted = new Map<string, { key: string; label: string; count: number }>();
  for (const row of records) {
    const key = groupKey(row, field);
    const group = counted.get(key);
    if (group) {
      group.count += 1;
    } else {
      const label = key === unassigned ? (field === 'channel' ? 'Sem canal informado' : 'Sem responsável informado') : displayName(row, field);
      counted.set(key, { key, label, count: 1 });
    }
  }
  return [...counted.values()];
}
type MetricId = (typeof metrics)[number]['id'];
const trendNames = { leads: 'leads', sales: 'vendas', contracts: 'contratos' } as const;

export function CommercialView() {
  const [selected, setSelected] = useState<MetricId>('sales');
  return (
    <IxcPeriodPanel<CommercialMetrics> title="Indicadores de vendas" description="Leads, vendas fechadas e contratos criados no IXC.">
      {(data) => <CommercialDetails key={data.periodKey} data={data} selected={selected} setSelected={setSelected} />}
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
  const [dateOrder, setDateOrder] = useState<CommercialDateOrder>('descending');
  const [interval, setInterval] = useState<TrendBucket | null>(null);
  const [rankBy, setRankBy] = useState<NameField>('channel');
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const selectedMetricButton = useRef<HTMLButtonElement>(null);
  const restoreMetricFocus = useRef(false);

  useLayoutEffect(() => {
    if (restoreMetricFocus.current) {
      selectedMetricButton.current?.focus({ preventScroll: true });
      restoreMetricFocus.current = false;
    }
  }, [selected]);

  const current = data.metrics[selected];
  const missingNames = current?.some(row => (row.channel && !row.channelName) || (row.responsible && !row.responsibleName));
  const channelGroups = groups(current ?? [], 'channel');
  const responsibleGroups = groups(current ?? [], 'responsible');
  const byName = (left: { label: string }, right: { label: string }) => left.label.localeCompare(right.label, 'pt-BR', { numeric: true });
  const channelOptions = [...channelGroups].sort(byName).map(({ key, label }) => [key, label]);
  const responsibleOptions = [...responsibleGroups].sort(byName).map(({ key, label }) => [key, label]);
  const rankingField = selected === 'contracts' ? 'responsible' : rankBy;
  const ranked = [...(rankingField === 'channel' ? channelGroups : responsibleGroups)].sort((a, b) => b.count - a.count || byName(a, b));
  const earlier = data.timestamps[selected] === data.readAt ? data.series?.[selected] : null;
  const buckets = useMemo(() => current
    ? commercialTrendBuckets(data.period, countCommercialDays(current), data.compared, earlier)
    : [], [current, data.period, data.compared, earlier]);
  const activeChannel = channelOptions.some(([id]) => id === channel) ? channel : '';
  const activeResponsible = responsibleOptions.some(([id]) => id === responsible) ? responsible : '';
  const filtered = current?.filter((row) =>
    (!activeChannel || groupKey(row, 'channel') === activeChannel)
    && (!activeResponsible || groupKey(row, 'responsible') === activeResponsible)
    && (!interval || (row.date >= interval.from && row.date <= interval.to))) ?? [];
  const sorted = sortCommercialRecordsByDate(filtered, dateOrder);
  const hasFilters = Boolean(activeChannel || activeResponsible || interval);
  const days = (Date.parse(data.period.to) - Date.parse(data.period.from)) / 86_400_000 + 1;
  const SortIcon = dateOrder === 'descending' ? ArrowDown : ArrowUp;
  const responsibleLabel = selected === 'contracts' ? 'Vendedor' : 'Responsável';
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, lastPage);

  function resetDetail() {
    setChannel('');
    setResponsible('');
    setInterval(null);
    setPage(1);
  }

  function inspectDetail() {
    setPage(1);
    detailHeading.current?.focus({ preventScroll: true });
    detailHeading.current?.scrollIntoView({ block: 'start' });
  }

  function renderMetric(id: MetricId) {
    const metric = metrics.find(item => item.id === id)!;
    const records = data.metrics[id];
    const timestamp = data.timestamps[id];
    const active = selected === id;
    return (
      <button key={id} type="button" ref={active ? selectedMetricButton : undefined} aria-pressed={active} aria-controls="commercial-detail"
        onClick={event => {
          if (!active) {
            restoreMetricFocus.current = document.activeElement === event.currentTarget;
            setSelected(id);
            resetDetail();
          }
        }}
        className="ix-kpi" title={metric.detail}>
        <IndicatorMetric icon={metric.icon} label={metric.label} value={records ? numbers.format(records.length) : '—'}>
          {data.compared && <IxcMetricComparison current={timestamp === data.readAt ? records?.length : undefined}
            previous={data.comparison[id]} loading={data.comparisonLoading} />}
          {(!timestamp || timestamp !== data.readAt) && <IxcMetricStatus timestamp={timestamp} loading={data.loading} />}
        </IndicatorMetric>
      </button>
    );
  }

  return (
    <>
      <section className="ix-metrics" aria-label="Totais do período">
        {metrics.map(({ id }) => renderMetric(id))}
        <div className="ix-kpi">
          <IndicatorMetric label="Média diária" icon={Activity} value={current && Number.isInteger(days) && days > 0 ? dailyAverage.format(current.length / days) : '—'}>
            {trendNames[selected]} por dia
            {(!data.timestamps[selected] || data.timestamps[selected] !== data.readAt) && <IxcMetricStatus timestamp={data.timestamps[selected]} loading={data.loading} />}
          </IndicatorMetric>
        </div>
      </section>
      <div className="ix-split">
        <section aria-labelledby="commercial-trend" className="ix-pane">
          <h3 id="commercial-trend">Evolução de {trendNames[selected]}</h3>
          {buckets.length ? (
            <>
              <p className="mb-2 text-xs text-[var(--app-muted)]">Selecione um intervalo para ver os registros.</p>
              <CommercialTrend buckets={buckets} active={interval} onSelect={next => {
                setInterval(current => current?.from === next.from && current.to === next.to ? null : next);
                inspectDetail();
              }} />
            </>
          ) : <p className="mt-3 text-sm text-[var(--app-muted)]">{data.loading ? 'Aguardando a consulta do IXC.' : 'Série indisponível.'}</p>}
        </section>

        <div className="ix-distribution-wrap">
          <IndicatorDistribution
            compact
            title={'Distribuição por ' + (rankingField === 'channel' ? 'canal' : responsibleLabel.toLowerCase())}
            description="Selecione uma categoria para filtrar os registros."
            totalLabel={trendNames[selected]}
            rows={ranked}
            selected={rankingField === 'channel' ? activeChannel : activeResponsible}
            emptyMessage={current ? 'Nenhum registro no período.' : data.loading ? 'Consultando o IXC…' : 'Distribuição indisponível.'}
            onSelect={key => {
              if (rankingField === 'channel') setChannel(value => value === key ? '' : key);
              else setResponsible(value => value === key ? '' : key);
              inspectDetail();
            }}
            controls={selected !== 'contracts' && (
              <label className="min-w-0 text-xs text-[var(--app-muted)]">
                <span className="sr-only">Agrupar distribuição</span>
                <select className={ixcFilterControl} value={rankingField} onChange={event => setRankBy(event.target.value as NameField)}>
                  <option value="channel">Canal</option>
                  <option value="responsible">Responsável</option>
                </select>
              </label>
            )}
          />
        </div>
      </div>

      <section id="commercial-detail" aria-labelledby="commercial-detail-title"
        className="ix-detail">
        <div className="ix-detail-head flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 ref={detailHeading} id="commercial-detail-title" tabIndex={-1} className="scroll-mt-24">Detalhamento de {trendNames[selected]}</h3>
            {interval && <p className="mt-0.5 text-xs text-[var(--app-muted)]">{formatDay(interval.from)} a {formatDay(interval.to)}</p>}
            {current && (
              <p aria-live="polite" className="mt-0.5 text-xs text-[var(--app-muted)]">
                {hasFilters
                  ? numbers.format(filtered.length) + ' de ' + numbers.format(current.length) + ' registros'
                  : numbers.format(current.length) + (current.length === 1 ? ' registro' : ' registros')}
              </p>
            )}
          </div>
          {current && current.length > 0 && (
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto" role="group" aria-label="Filtros do detalhamento">
              {selected !== 'contracts' && (
                <label className="min-w-0 flex-1 space-y-1 text-xs sm:flex-none">
                  Canal
                  <select className={ixcFilterControl + ' max-w-full sm:max-w-60'} value={activeChannel} onChange={(event) => { setChannel(event.target.value); setPage(1); }}>
                    <option value="">Todos</option>
                    {channelOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </label>
              )}
              <label className="min-w-0 flex-1 space-y-1 text-xs sm:flex-none">
                {responsibleLabel}
                <select className={ixcFilterControl + ' max-w-full sm:max-w-60'} value={activeResponsible} onChange={(event) => { setResponsible(event.target.value); setPage(1); }}>
                  <option value="">Todos</option>
                  {responsibleOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              {hasFilters && (
                <button type="button" onClick={resetDetail}
                  className="min-h-9 rounded-md px-2 text-xs font-semibold underline underline-offset-4 focus-visible:outline-2">
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>
        {missingNames && <p className="border-b border-[var(--app-border)] px-4 py-2 text-xs text-[var(--app-muted)]">
          Alguns nomes de canais ou responsáveis estão indisponíveis no IXC. O total de registros está disponível.
        </p>}
        {!filtered.length ? (
          <p className="p-4 text-sm text-[var(--app-muted)]">{current ? (hasFilters ? 'Nenhum registro corresponde aos filtros.' : 'Nenhum registro neste período.')
            : data.loading ? 'Aguardando a consulta do IXC.' : 'Este indicador não pôde ser carregado. Consulte o período novamente.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--app-canvas)]">
                <tr>
                  <th scope="col" className="px-4 py-2">ID no IXC</th>
                  <th scope="col" aria-sort={dateOrder} className="whitespace-nowrap px-4 py-2">
                    <button type="button"
                      title={dateOrder === 'descending' ? 'Mostrar registros mais antigos primeiro' : 'Mostrar registros mais recentes primeiro'}
                      onClick={() => {
                        setDateOrder(order => order === 'descending' ? 'ascending' : 'descending');
                        setPage(1);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
                      Data <SortIcon size={14} aria-hidden="true" />
                    </button>
                  </th>
                  {selected !== 'contracts' && <th scope="col" className="px-4 py-2">Canal</th>}
                  <th scope="col" className="px-4 py-2">{responsibleLabel}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice((visiblePage - 1) * pageSize, visiblePage * pageSize).map((row) => (
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
