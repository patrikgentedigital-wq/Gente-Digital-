'use client';

import { Activity, CalendarDays, CircleX, Tag } from 'lucide-react';
import { IndicatorMetric } from './indicator-metric';
import { useState } from 'react';
import type { DirectCancellationMetrics } from '@/lib/analytics/commercial-ixc';
import { IndicatorDistribution } from './indicator-distribution';
import {
  formatDay, IxcMetricComparison, IxcMetricStatus, IxcPeriodPanel, ixcFilterControl, type IxcPeriodData,
} from './ixc-period-panel';

const numbers = new Intl.NumberFormat('pt-BR');
const signedNumbers = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export function CancelamentosView() {
  return (
    <IxcPeriodPanel<DirectCancellationMetrics>
      title="Indicadores de cancelamentos"
      description="Contratos por data de cancelamento, consultados no IXC."
      section="cancelamentos"
    >
      {data => <CancellationPanorama key={data.periodKey} data={data} />}
    </IxcPeriodPanel>
  );
}

function CancellationPanorama({ data }: { data: IxcPeriodData<DirectCancellationMetrics> }) {
  const [selected, setSelected] = useState<string>();
  const [order, setOrder] = useState<'volume' | 'name'>('volume');
  const { metrics: { total, byReason }, timestamps, loading, readAt, compared, comparison, comparisonLoading } = data;
  const reasons = total === 0 ? [] : byReason ?? [];
  const reasonRows = reasons.map(({ key, count }) => ({ key, label: key, count }));
  if (order === 'name') reasonRows.sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));

  const reason = reasons.find(item => item.key === selected);
  const reasonTotal = reasons.reduce((sum, item) => sum + item.count, 0);
  const reasonDetail = reason && reasonTotal > 0 ? (
    <p className="text-sm text-[var(--app-muted)] tabular-nums">
      {numbers.format(reason.count)} de {numbers.format(reasonTotal)} cancelamentos
      {' '}({percent.format(reason.count / reasonTotal)} na leitura dos motivos).
    </p>
  ) : null;
  const reasonsStale = Boolean(timestamps.byReason && timestamps.byReason !== readAt);
  const current = timestamps.total === readAt ? total : undefined;
  const previous = compared && !comparisonLoading ? comparison.total ?? undefined : undefined;
  const comparable = current !== undefined && previous !== undefined;
  const difference = comparable ? current - previous : undefined;
  const scale = comparable ? Math.max(current, previous, 1) : undefined;
  const volumes = [
    ...(compared ? [{ label: 'Período anterior', value: previous, bar: 'ix-prior' }] : []),
    { label: 'Período atual', value: total, bar: 'ix-now' },
  ];
  const emptyMessage = byReason || total === 0
    ? 'Nenhum cancelamento no período.'
    : loading ? 'Aguardando a consulta do IXC.'
      : total === undefined ? 'Os motivos dependem da consulta de cancelamentos.'
        : 'O catálogo de motivos do IXC está indisponível.';

  return (
    <>
      <section className="ix-metrics" aria-label="Totais do período">
        <div className="ix-kpi"><IndicatorMetric label="Cancelamentos" icon={CircleX} value={total == null ? '—' : numbers.format(total)}>
          {formatDay(data.period.from)} a {formatDay(data.period.to)}
          {(!timestamps.total || timestamps.total !== readAt) && <IxcMetricStatus timestamp={timestamps.total} loading={loading} />}
        </IndicatorMetric></div>
        <div className="ix-kpi"><IndicatorMetric label="Período anterior" icon={CalendarDays} value={previous == null ? '—' : numbers.format(previous)}>
          {previous !== undefined && compared ? formatDay(compared.from) + ' a ' + formatDay(compared.to) : comparisonLoading ? 'Consultando comparação…' : 'Comparação indisponível'}
        </IndicatorMetric></div>
        <div className="ix-kpi"><IndicatorMetric label="Variação" icon={Activity} value={difference == null ? '—' : signedNumbers.format(difference)}>
          <IxcMetricComparison current={current} previous={previous} loading={comparisonLoading} />
        </IndicatorMetric></div>
        <div className="ix-kpi"><IndicatorMetric label="Motivos registrados" icon={Tag} value={byReason || total === 0 ? numbers.format(reasons.length) : '—'}>
          {byReason || total === 0 ? 'categorias no período' : 'Aguardando o catálogo do IXC'}
          {total !== 0 && reasonsStale && <IxcMetricStatus timestamp={timestamps.byReason} loading={loading} />}
        </IndicatorMetric></div>
      </section>
      <div className="ix-split ix-cancellations">
        <IndicatorDistribution
          title="Motivos de cancelamento"
          description={reasons.length ? 'Selecione um motivo para detalhar.' : undefined}
          totalLabel="cancelamentos"
          rows={reasonRows}
          selected={reason?.key}
          selectedRowDetail={reasonDetail}
          onSelect={key => setSelected(previousKey => previousKey === key ? undefined : key)}
          controls={reasons.length > 1 && (
            <div className="w-fit max-w-full">
              <select aria-label="Ordenar motivos de cancelamento" value={order}
                className={ixcFilterControl + ' min-h-11'}
                onChange={event => setOrder(event.target.value === 'name' ? 'name' : 'volume')}>
                <option value="volume">Maior volume</option>
                <option value="name">Ordem alfabética</option>
              </select>
            </div>
          )}
          footer={(
            <>
              {reasons.length > 0 && (
                <p className="mt-3 text-xs text-[var(--app-muted)]">
                  {numbers.format(reasons.length)} {reasons.length === 1 ? 'motivo' : 'motivos'}
                </p>
              )}
              {total !== 0 && reasonsStale && <IxcMetricStatus timestamp={timestamps.byReason} loading={loading} />}
              <div aria-live="polite" className="hidden lg:block">
                {reason && reasonDetail && (
                  <div className="ix-reason-detail">
                    <p className="font-medium break-words">{reason.key}</p>
                    {reasonDetail}
                  </div>
                )}
              </div>
            </>
          )}
          emptyMessage={emptyMessage}
        />

        <section className="ix-pane" aria-labelledby="cancellation-volume">
          <h3 id="cancellation-volume">Volume de cancelamentos</h3>
          <p className="ix-caption">Comparação entre os períodos.</p>
          {difference !== undefined && <p className="ix-total"><strong>{signedNumbers.format(difference)}</strong> cancelamentos de diferença</p>}
          <dl className="ix-volume">
            {volumes.map(({ label, value, bar }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="ix-volume-plot">
                  {value !== undefined && <i className={bar} style={{ height: (scale === undefined ? 0 : value / scale * 100) + '%' }} aria-hidden="true" />}
                  <span>{value === undefined ? '—' : numbers.format(value)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <p className="text-sm text-[var(--app-muted)]">
        Renovações, upgrades e downgrades vêm de outra fonte do relatório e estão em validação.
      </p>
    </>
  );
}
