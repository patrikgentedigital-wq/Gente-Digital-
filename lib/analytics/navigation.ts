export type AnalyticsTabId = 'geral' | 'atendimento' | 'cancelamentos';

export interface AnalyticsTabDefinition {
  id: AnalyticsTabId;
  label: string;
  description: string;
}

export const ANALYTICS_TABS: readonly AnalyticsTabDefinition[] = [
  {
    id: 'geral',
    label: 'GERAL',
    description: 'Leads, vendas e contratos',
  },
  {
    id: 'atendimento',
    label: 'ATENDIMENTO',
    description: 'Volume, canais e status',
  },
  {
    id: 'cancelamentos',
    label: 'CANCELAMENTOS',
    description: 'Eventos e motivos',
  },
];

export function isAnalyticsTabId(value: string | null): value is AnalyticsTabId {
  return ANALYTICS_TABS.some((tab) => tab.id === value);
}

export function getAnalyticsTabLabel(tab: AnalyticsTabId): string {
  return ANALYTICS_TABS.find((item) => item.id === tab)?.label ?? 'GERAL';
}
