'use client';

import type { DirectCancellationMetrics } from '@/lib/analytics/commercial-ixc';
import { IxcMetricComparison, IxcMetricStatus, IxcPeriodPanel } from './ixc-period-panel';

const numbers = new Intl.NumberFormat('pt-BR');

export function CancelamentosView() {
  return (
    <IxcPeriodPanel<DirectCancellationMetrics>
      title="Cancelamentos"
      description="Contratos por data de cancelamento, consultados no IXC."
      section="cancelamentos"
    >
      {({ metrics: { total, byReason }, timestamps, loading, readAt, compared, comparison, comparisonLoading }) => (
        <>
          <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4" aria-label="Total de cancelamentos">
            <h3 className="text-sm font-semibold">Cancelamentos no período</h3>
            <p className="my-1 font-display text-4xl font-bold leading-none tabular-nums">
              {total === undefined ? '—' : numbers.format(total)}
            </p>
            {compared && (
              <IxcMetricComparison current={timestamps.total === readAt ? total : undefined}
                previous={comparison.total} loading={comparisonLoading} />
            )}
            {(!timestamps.total || timestamps.total !== readAt) && <IxcMetricStatus timestamp={timestamps.total} loading={loading} />}
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)]" aria-labelledby="cancellation-reasons">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--app-border)] px-4 py-3">
              <h3 id="cancellation-reasons" className="font-semibold">Cancelamentos por motivo</h3>
              {total !== 0 && byReason && (
                <p className="text-xs text-[var(--app-muted)]">
                  {numbers.format(byReason.length)} {byReason.length === 1 ? 'motivo' : 'motivos'}
                </p>
              )}
              {total !== 0 && timestamps.byReason && timestamps.byReason !== readAt && <IxcMetricStatus timestamp={timestamps.byReason} loading={loading} />}
            </div>
            {total !== 0 && byReason?.length ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--app-canvas)]">
                  <tr>
                    <th scope="col" className="px-4 py-2">Motivo</th>
                    <th scope="col" className="px-4 py-2 text-right">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {byReason.map(({ key, count }) => (
                    <tr key={key} className="border-t border-[var(--app-border)]">
                      <td className="px-4 py-2">{key}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{numbers.format(count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-[var(--app-muted)]">
                {byReason || total === 0 ? 'Nenhum cancelamento no período.'
                  : loading ? 'Aguardando a consulta do IXC.'
                    : total === undefined ? 'Os motivos dependem da consulta de cancelamentos.'
                      : 'O catálogo de motivos do IXC está indisponível.'}
              </p>
            )}
          </section>

          <p className="text-sm text-[var(--app-muted)]">
            Renovações, upgrades e downgrades vêm de outra fonte do relatório e estão em validação.
          </p>
        </>
      )}
    </IxcPeriodPanel>
  );
}
