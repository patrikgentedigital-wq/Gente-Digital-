import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANALYTICS_TABS,
  getAnalyticsTabLabel,
  isAnalyticsTabId,
} from '../../lib/analytics/navigation';

test('aceita somente as três páginas do escopo', () => {
  assert.equal(isAnalyticsTabId('geral'), true);
  assert.equal(isAnalyticsTabId('atendimento'), true);
  assert.equal(isAnalyticsTabId('cancelamentos'), true);
  assert.equal(isAnalyticsTabId('hunter'), false);
  assert.equal(isAnalyticsTabId('farmer'), false);
  assert.equal(isAnalyticsTabId(null), false);
});

test('rotula as três páginas em português e mantém ordem fechada', () => {
  assert.deepEqual(ANALYTICS_TABS.map((tab) => tab.id), [
    'geral',
    'atendimento',
    'cancelamentos',
  ]);
  assert.equal(getAnalyticsTabLabel('geral'), 'GERAL');
  assert.equal(getAnalyticsTabLabel('atendimento'), 'ATENDIMENTO');
  assert.equal(getAnalyticsTabLabel('cancelamentos'), 'CANCELAMENTOS');
});
