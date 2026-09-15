import { ArrowDownRight, ArrowUpRight, Ban, RefreshCcw } from 'lucide-react';

import type { AnalyticsOverviewResponse } from '@/lib/analytics/response';

import {
  AnalyticsDimensionList,
  AnalyticsMetricCard,
  AnalyticsPageIntro,
  AnalyticsSourceNotice,
} from './analytics-primitives';

export function CancelamentosView({ overview }: { overview: AnalyticsOverviewResponse }) {
  const canShowValues = overview.meta.sections.cancelamentos === 'success';
  const { cancelamentos } = overview.data;

  return (
    <div className="space-y-6">
      <AnalyticsPageIntro
        eyebrow="03 / retenção"
        title="CANCELAMENTOS"
        description="Identifique o volume de cancelamentos e os motivos que precisam de ação operacional."
        source="IXC"
      />
      <AnalyticsSourceNotice status={overview.meta.sections.cancelamentos} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetricCard
          label="Cancelamentos"
          value={cancelamentos.total}
          detail="Eventos de cancelamento na janela"
          icon={Ban}
          tone="rose"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Renovações"
          value={cancelamentos.renewals}
          detail="Eventos classificados como renovação"
          icon={RefreshCcw}
          tone="emerald"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Upgrades"
          value={cancelamentos.upgrades}
          detail="Eventos classificados como upgrade"
          icon={ArrowUpRight}
          tone="blue"
          canShowValues={canShowValues}
        />
        <AnalyticsMetricCard
          label="Downgrades"
          value={cancelamentos.downgrades}
          detail="Eventos classificados como downgrade"
          icon={ArrowDownRight}
          tone="amber"
          canShowValues={canShowValues}
        />
      </div>
      <AnalyticsDimensionList title="Cancelamentos por motivo" items={cancelamentos.byReason} canShowValues={canShowValues} />
    </div>
  );
}
