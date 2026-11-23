import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sortCommercialRecordsByDate } from '../../lib/analytics/commercial-detail';

test('ordena todo o detalhamento por data e mantém a ordem dos registros do mesmo dia', () => {
  const rows = [
    { id: '1', date: '2026-10-10' },
    { id: '2', date: '2026-10-31' },
    { id: '3', date: '2026-10-02' },
    { id: '4', date: '2026-10-31' },
  ];

  assert.deepEqual(sortCommercialRecordsByDate(rows, 'descending').map(row => row.id), ['2', '4', '1', '3']);
  assert.deepEqual(sortCommercialRecordsByDate(rows, 'ascending').map(row => row.id), ['3', '1', '2', '4']);
  assert.deepEqual(rows.map(row => row.id), ['1', '2', '3', '4']);
});
