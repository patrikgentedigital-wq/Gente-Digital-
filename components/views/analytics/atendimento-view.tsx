import { Activity, CheckCircle2, CircleHelp, MessagesSquare, UserRoundX } from 'lucide-react';

import type { AnalyticsOverviewResponse } from '@/lib/analytics/response';

import {
  AnalyticsDimensionList,
  AnalyticsMetricCard,
  AnalyticsPageIntro,
  AnalyticsSourceNotice,
} from './analytics-primitives';

export function AtendimentoView({ overview }: { overview: AnalyticsOverviewResponse }) {
  const canShowValues = overview.meta.status === 'success';
  const { atendimento } = overview.data;

  return (
    <div className="space-y-6">
      <AnalyticsPageIntro
        eyebrow="02 / operação"
        title="ATENDIMENTO"
        description="Veja o volume de atendimentos, os vínculos reconhecidos e a distribuição por canal e status."
        source="Opa! Suite"
      />
      <AnalyticsSourceNotice status={overview.meta.status} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AnalyticsMetricCard
          label="Total"
          value={atendimento.total}
          detail="Atendimentos únicos na janela"
          icon={MessagesSquare}
          tone="amber"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Vinculados"
          value={atendimento.linked}
          detail="Vínculos confirmados"
          icon={CheckCircle2}
          tone="emerald"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Não vinculados"
          value={atendimento.unlinked}
          detail="Identificador bruto sem vínculo confirmado"
          icon={UserRoundX}
          tone="rose"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Ambíguos"
          value={atendimento.ambiguous}
          detail="Registros que exigem revisão de chave"
          icon={CircleHelp}
          tone="blue"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Conflitos"
          value={atendimento.protocolConflicts}
          detail="Protocolos com dimensões divergentes"
          icon={Activity}
          tone="slate"
          canShowValues={canShowValues}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsDimensionList title="Atendimentos por canal" items={atendimento.byChannel} canShowValues={canShowValues} />
        <AnalyticsDimensionList title="Atendimentos por status" items={atendimento.byStatus} canShowValues={canShowValues} />
      </div>
    </div>
  );
}
