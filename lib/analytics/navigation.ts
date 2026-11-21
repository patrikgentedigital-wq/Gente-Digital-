export type AnalyticsTabId = 'geral' | 'cancelamentos';

export interface AnalyticsTabDefinition {
  id: AnalyticsTabId;
  label: string;
  description: string;
}

export const ANALYTICS_TABS: readonly AnalyticsTabDefinition[] = [
  {
    id: 'geral',
    label: 'Vendas',
    description: 'Leads, vendas e contratos criados',
  },
  {
    id: 'cancelamentos',
    label: 'Cancelamentos',
    description: 'Eventos e motivos',
  },
];

export function isAnalyticsTabId(value: string | null): value is AnalyticsTabId {
  return ANALYTICS_TABS.some((tab) => tab.id === value);
}

export function getAnalyticsTabLabel(tab: AnalyticsTabId): string {
  return ANALYTICS_TABS.find((item) => item.id === tab)?.label ?? 'Vendas';
}
