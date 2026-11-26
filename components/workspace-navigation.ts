import { ChartColumnIncreasing, CircleX, LayoutDashboard, ListFilter, MapPin, UsersRound, Wallet, type LucideIcon } from 'lucide-react';
import { ANALYTICS_TABS, type AnalyticsTabId } from '@/lib/analytics/navigation';
import { SIDEBAR_NAV_ITEMS, type SidebarTabId } from '@/lib/dashboard-navigation';

export type WorkspaceItem = {
  id: string;
  label: string;
  section: 'Programa' | 'Indicadores';
  icon: LucideIcon;
  tab: SidebarTabId;
  analytics?: AnalyticsTabId;
};

const moduleIcons = {
  dashboard: LayoutDashboard, leads: ListFilter, viabilidade: MapPin,
  colaboradores: UsersRound, comissoes: Wallet,
};

export function workspaceItems(admin: boolean): WorkspaceItem[] {
  const program: WorkspaceItem[] = SIDEBAR_NAV_ITEMS.flatMap(({ id, label }) => id === 'indicadores' ? [] : [{
    id, tab: id, label, section: 'Programa' as const, icon: moduleIcons[id],
  }]);
  if (!admin) return program;
  return [...program, ...ANALYTICS_TABS.map(({ id, label }) => ({
    id: 'indicadores-' + id, tab: 'indicadores' as const, analytics: id, label, section: 'Indicadores' as const,
    icon: id === 'geral' ? ChartColumnIncreasing : CircleX,
  }))];
}
