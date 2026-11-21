import assert from 'node:assert/strict';
import { test } from 'node:test';

import { comparisonPeriod, presetPeriod, saveIxcSnapshot } from '../../lib/analytics/ixc-period';

test('atalhos usam a data local, incluem hoje e atravessam a virada do ano', () => {
  assert.deepEqual(presetPeriod('previous-month', '2027-01-03'), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(presetPeriod('last-seven', '2027-01-03'), { from: '2026-12-28', to: '2027-01-03' });
  assert.deepEqual(presetPeriod('this-month', '2027-01-03'), { from: '2027-01-01', to: '2027-01-03' });
});

test('compara mês fechado, mês em andamento e período personalizado', () => {
  assert.deepEqual(comparisonPeriod({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-21'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(comparisonPeriod({ from: '2026-11-01', to: '2026-11-21' }, '2026-11-21'), { from: '2026-10-01', to: '2026-10-21' });
  assert.deepEqual(comparisonPeriod({ from: '2026-11-15', to: '2026-11-21' }, '2026-11-21'), { from: '2026-11-08', to: '2026-11-14' });
  assert.deepEqual(comparisonPeriod({ from: '2026-03-01', to: '2026-03-30' }, '2026-03-30'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(comparisonPeriod({ from: '', to: '2026-11-21' }, '2026-11-21'), null);
});

test('preserva a leitura anterior de cada indicador indisponível e aceita zero real', () => {
  type Metrics = { total: number | null; sales: number[] | null };
  const initial = saveIxcSnapshot<Metrics>(undefined, { total: 7, sales: [1] }, '2026-11-21T14:00:00Z');
  assert.deepEqual(saveIxcSnapshot(initial, { total: 0, sales: null }, '2026-11-21T15:00:00Z'), {
    metrics: { total: 0, sales: [1] },
    timestamps: { total: '2026-11-21T15:00:00Z', sales: '2026-11-21T14:00:00Z' },
  });
});
