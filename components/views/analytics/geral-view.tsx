import { FileChartColumn, Handshake, MousePointer2, ReceiptText } from 'lucide-react';

import type { AnalyticsOverviewResponse } from '@/lib/analytics/response';

import {
  AnalyticsMetricCard,
  AnalyticsPageIntro,
  AnalyticsSourceNotice,
} from './analytics-primitives';

export function GeralView({ overview }: { overview: AnalyticsOverviewResponse }) {
  const canShowValues = overview.meta.status === 'success';
  const { geral } = overview.data;

  return (
    <div className="space-y-6">
      <AnalyticsPageIntro
        eyebrow="01 / visão executiva"
        title="GERAL"
        description="Acompanhe o fluxo de indicação e a conversão consolidada do Indique e Ganhe."
        source="Indique e Ganhe + IXC"
      />
      <AnalyticsSourceNotice status={overview.meta.status} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetricCard
          label="Leads"
          value={geral.leads}
          detail="Indicações recebidas na janela"
          icon={MousePointer2}
          tone="blue"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Vendas"
          value={geral.sales}
          detail="Vendas confirmadas na origem"
          icon={Handshake}
          tone="emerald"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Contratos"
          value={geral.contracts}
          detail="Contratos na janela selecionada"
          icon={ReceiptText}
          tone="amber"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Pré-contratos"
          value={geral.preContracts}
          detail="Métrica disponível quando a fonte for confirmada"
          icon={FileChartColumn}
          tone="slate"
          canShowValues={canShowValues}
        />
      </div>
      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-5 text-sm leading-6 text-zinc-500">
        Vendas e contratos só são considerados definitivos após a confirmação da fonte, da data de referência e da reconciliação com o Data Studio.
      </div>
    </div>
  );
}
