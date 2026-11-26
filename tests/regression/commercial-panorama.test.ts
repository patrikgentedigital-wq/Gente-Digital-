import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialTrendBuckets, countCommercialDays } from '../../lib/analytics/commercial-panorama';

test('agrega datas comerciais sem enviar identificadores e mantém a ordem cronológica', () => {
  assert.deepEqual(countCommercialDays([
    { date: '2026-10-04' }, { date: '2026-10-01' }, { date: '2026-10-04' },
  ]), [
    { date: '2026-10-01', count: 1 }, { date: '2026-10-04', count: 2 },
  ]);
});

test('compara meses por intervalos e preserva as sobras de cada competência', () => {
  const buckets = commercialTrendBuckets(
    { from: '2026-09-01', to: '2026-09-30' },
    [{ date: '2026-09-01', count: 4 }, { date: '2026-09-30', count: 2 }],
    { from: '2026-08-01', to: '2026-08-31' },
    [{ date: '2026-08-01', count: 5 }, { date: '2026-08-31', count: 3 }],
  );
  assert.deepEqual(buckets.map(({ current, previous }) => [current, previous]), [
    [4, 5], [0, 0], [0, 0], [0, 0], [2, 3],
  ]);
  assert.deepEqual(buckets.at(-1), {
    from: '2026-09-29', to: '2026-09-30', label: '29–30/09', current: 2, previous: 3, partial: true,
  });
});

test('série anterior indisponível permanece nula e uma série vazia pode zerar', () => {
  const period = { from: '2026-10-01', to: '2026-10-02' };
  const prior = { from: '2026-09-29', to: '2026-09-30' };
  assert.deepEqual(commercialTrendBuckets(period, [], prior, null).map(({ previous }) => previous), [null, null]);
  assert.deepEqual(commercialTrendBuckets(period, [], prior, []).map(({ previous }) => previous), [0, 0]);
  assert.deepEqual(commercialTrendBuckets({ from: 'invalid', to: period.to }, [], null, null), []);
});
