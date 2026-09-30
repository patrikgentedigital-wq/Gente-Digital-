export type DashboardTabId =
  | 'dashboard'
  | 'leads'
  | 'vendas'
  | 'colaboradores'
  | 'comissoes'
  | 'integracoes'
  | 'indicadores';

export const TEMPORARILY_HIDDEN_DASHBOARD_TABS = [
  'vendas',
  'indicadores',
  'integracoes',
] as const satisfies readonly DashboardTabId[];

export type SidebarTabId = Exclude<
  DashboardTabId,
  (typeof TEMPORARILY_HIDDEN_DASHBOARD_TABS)[number]
>;

export interface SidebarNavItem {
  id: SidebarTabId;
  label: string;
}

export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'leads', label: 'Leads & Funil' },
  { id: 'colaboradores', label: 'Colaboradores' },
  { id: 'comissoes', label: 'Comissões & PIX' },
];

export function isTemporarilyHiddenDashboardTab(
  value: string | null,
): value is (typeof TEMPORARILY_HIDDEN_DASHBOARD_TABS)[number] {
  return value !== null && TEMPORARILY_HIDDEN_DASHBOARD_TABS.includes(
    value as (typeof TEMPORARILY_HIDDEN_DASHBOARD_TABS)[number],
  );
}

export function resolveDashboardNavigation(tabParam: string | null): {
  activeTab: SidebarTabId;
  redirectHiddenTab: boolean;
} {
  if (isTemporarilyHiddenDashboardTab(tabParam)) {
    return { activeTab: 'dashboard', redirectHiddenTab: true };
  }

  const visibleTab = SIDEBAR_NAV_ITEMS.find(({ id }) => id === tabParam);
  return { activeTab: visibleTab?.id ?? 'dashboard', redirectHiddenTab: false };
}
