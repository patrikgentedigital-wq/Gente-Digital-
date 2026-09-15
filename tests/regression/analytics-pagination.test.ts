import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchAllPages } from '../../lib/analytics/query';

test('fetchAllPages percorre páginas completas até a última página parcial', async () => {
  const calls: Array<[number, number]> = [];
  const pages = new Map<number, string[]>([
    [0, ['a', 'b']],
    [2, ['c', 'd']],
    [4, ['e']],
  ]);

  const result = await fetchAllPages(
    async (from, to) => {
      calls.push([from, to]);
      return { data: pages.get(from) ?? [], error: null };
    },
    { pageSize: 2 },
  );

  assert.deepEqual(result, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(calls, [[0, 1], [2, 3], [4, 5]]);
});

test('fetchAllPages falha com limite explícito quando a fonte não termina', async () => {
  await assert.rejects(
    fetchAllPages(
      async () => ({ data: ['item'], error: null }),
      { pageSize: 1, maxPages: 2 },
    ),
    /limite de páginas/i,
  );
});
