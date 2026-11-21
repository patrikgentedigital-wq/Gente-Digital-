import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANALYTICS_TABS,
  getAnalyticsTabLabel,
  isAnalyticsTabId,
} from '../../lib/analytics/navigation';

test('aceita Vendas e Cancelamentos e rejeita a aba de Atendimento', () => {
  assert.equal(isAnalyticsTabId('geral'), true);
  assert.equal(isAnalyticsTabId('atendimento'), false);
  assert.equal(isAnalyticsTabId('cancelamentos'), true);
  assert.equal(isAnalyticsTabId('hunter'), false);
  assert.equal(isAnalyticsTabId('farmer'), false);
  assert.equal(isAnalyticsTabId(null), false);
});

test('mostra somente Vendas e Cancelamentos na ordem do menu', () => {
  assert.deepEqual(ANALYTICS_TABS.map((tab) => tab.id), [
    'geral',
    'cancelamentos',
  ]);
  assert.equal(getAnalyticsTabLabel('geral'), 'Vendas');
  assert.equal(getAnalyticsTabLabel('cancelamentos'), 'Cancelamentos');
});
