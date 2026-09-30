import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const navigationModulePath = new URL('../../lib/dashboard-navigation.ts', import.meta.url);

test('menu lateral oculta somente Indicadores, Vendas e Integrações', async () => {
  assert.equal(
    existsSync(navigationModulePath),
    true,
    'a configuração central das abas disponíveis precisa existir',
  );

  const {
    SIDEBAR_NAV_ITEMS,
    TEMPORARILY_HIDDEN_DASHBOARD_TABS,
    isTemporarilyHiddenDashboardTab,
    resolveDashboardNavigation,
  } = await import(navigationModulePath.href);

  assert.deepEqual(
    SIDEBAR_NAV_ITEMS.map((item: { id: string }) => item.id),
    ['dashboard', 'leads', 'colaboradores', 'comissoes'],
  );
  assert.deepEqual(TEMPORARILY_HIDDEN_DASHBOARD_TABS, [
    'vendas',
    'indicadores',
    'integracoes',
  ]);

  for (const tab of TEMPORARILY_HIDDEN_DASHBOARD_TABS) {
    assert.equal(isTemporarilyHiddenDashboardTab(tab), true);
  }
  assert.equal(isTemporarilyHiddenDashboardTab('leads'), false);
  assert.equal(isTemporarilyHiddenDashboardTab(null), false);

  for (const tab of TEMPORARILY_HIDDEN_DASHBOARD_TABS) {
    assert.deepEqual(resolveDashboardNavigation(tab), {
      activeTab: 'dashboard',
      redirectHiddenTab: true,
    });
  }
  assert.deepEqual(resolveDashboardNavigation('leads'), {
    activeTab: 'leads',
    redirectHiddenTab: false,
  });
  assert.deepEqual(resolveDashboardNavigation(null), {
    activeTab: 'dashboard',
    redirectHiddenTab: false,
  });
});

test('remove o atalho de Analytics enquanto Indicadores está oculto', () => {
  const source = readFileSync(
    new URL('../../components/views/colaboradores.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /title=["']Ver Analytics["']/);
  assert.doesNotMatch(source, /BarChart2/);
});
