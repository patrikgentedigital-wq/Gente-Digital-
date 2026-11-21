'use client';

import type { DirectCancellationMetrics } from '@/lib/analytics/commercial-ixc';
import { IxcPeriodPanel } from './ixc-period-panel';

const numbers = new Intl.NumberFormat('pt-BR');

export function CancelamentosView() {
  return (
    <IxcPeriodPanel<DirectCancellationMetrics>
      title="Cancelamentos"
      description="Contratos por data de cancelamento, consultados no IXC."
      section="cancelamentos"
    >
      {({ total, byReason }) => (
        <>
          <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4" aria-label="Total de cancelamentos">
            <h3 className="text-sm font-semibold">Cancelamentos no período</h3>
            <p className="mt-1 text-2xl font-bold tabular-nums">{numbers.format(total)}</p>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)]" aria-labelledby="cancellation-reasons">
            <h3 id="cancellation-reasons" className="p-4 font-semibold">Cancelamentos por motivo</h3>
            {byReason?.length ? (
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
              <p className="px-4 pb-4 text-sm text-[var(--app-muted)]">
                {byReason ? 'Nenhum cancelamento no período.' : 'O catálogo de motivos do IXC está indisponível.'}
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
