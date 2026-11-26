'use client';

import { useState } from 'react';
import type { DirectCancellationMetrics } from '@/lib/analytics/commercial-ixc';
import { IndicatorDistribution } from './indicator-distribution';
import {
  IxcMetricComparison, IxcMetricStatus, IxcPeriodPanel, ixcFilterControl, type IxcPeriodData,
} from './ixc-period-panel';

const numbers = new Intl.NumberFormat('pt-BR');
const signedNumbers = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export function CancelamentosView() {
  return (
    <IxcPeriodPanel<DirectCancellationMetrics>
      title="Cancelamentos"
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
  const reasonsStale = Boolean(timestamps.byReason && timestamps.byReason !== readAt);
  const current = timestamps.total === readAt ? total : undefined;
  const previous = compared && !comparisonLoading ? comparison.total ?? undefined : undefined;
  const comparable = current !== undefined && previous !== undefined;
  const difference = comparable ? current - previous : undefined;
  const scale = comparable ? Math.max(current, previous, 1) : undefined;
  const comparisonColor = difference === undefined || difference === 0 ? 'text-[var(--app-muted)]'
    : difference > 0 ? 'text-[#a6374d] dark:text-[#ff9eac]' : 'text-[#187053] dark:text-[#8adaac]';
  const volumes = [
    { label: 'Período atual', value: total, color: 'bg-[#20374f] dark:bg-[#9bb4d0]' },
    ...(compared ? [{ label: 'Período anterior', value: previous, color: 'bg-[#627a91] dark:bg-[#738ca7]' }] : []),
  ];
  const emptyMessage = byReason || total === 0
    ? 'Nenhum cancelamento no período.'
    : loading ? 'Aguardando a consulta do IXC.'
      : total === undefined ? 'Os motivos dependem da consulta de cancelamentos.'
        : 'O catálogo de motivos do IXC está indisponível.';

  return (
    <>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <IndicatorDistribution
          title="Motivos de cancelamento"
          description={reasons.length ? 'Selecione um motivo para detalhar.' : undefined}
          totalLabel="cancelamentos"
          rows={reasonRows}
          selected={reason?.key}
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
              <div aria-live="polite">
                {reason && reasonTotal > 0 && (
                  <div className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 py-3">
                    <p className="font-bold break-words">{reason.key}</p>
                    <p className="text-sm text-[var(--app-muted)] tabular-nums">
                      {numbers.format(reason.count)} de {numbers.format(reasonTotal)} cancelamentos
                      {' '}({percent.format(reason.count / reasonTotal)} na leitura dos motivos).
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
          emptyMessage={emptyMessage}
        />

        <section className="min-w-0 rounded-[25px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 shadow-[var(--app-shadow)] sm:p-5"
          aria-labelledby="cancellation-volume">
          <h3 id="cancellation-volume" className="text-base font-extrabold">Volume de cancelamentos</h3>
          {difference !== undefined && (
            <div className="mt-3">
              <p className="font-display text-5xl leading-none font-bold tracking-tight tabular-nums">{signedNumbers.format(difference)}</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">Diferença entre os períodos</p>
            </div>
          )}
          {compared && (
            <div className={comparisonColor}>
              <IxcMetricComparison current={current} previous={previous} loading={comparisonLoading} />
            </div>
          )}
          {(!timestamps.total || timestamps.total !== readAt) && <IxcMetricStatus timestamp={timestamps.total} loading={loading} />}
          <dl className="mt-4 space-y-3">
            {volumes.map(({ label, value, color }) => (
              <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 text-sm">
                <dt>{label}</dt>
                <dd className="text-lg leading-none font-bold tabular-nums">{value === undefined ? '—' : numbers.format(value)}</dd>
                {scale !== undefined && value !== undefined && (
                  <dd className="col-span-full h-2 overflow-hidden rounded-full bg-[var(--app-border)]" aria-hidden="true">
                    <span className={'block h-full rounded-full ' + color} style={{ width: value / scale * 100 + '%' }} />
                  </dd>
                )}
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
