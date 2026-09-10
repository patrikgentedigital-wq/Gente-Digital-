import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsTableContract } from '../fixtures/analytics/database-contract';

test('contrato local lista as tabelas analíticas sem dados de origem', () => {
  assert.deepEqual(analyticsTableContract.integration, [
    'opa_records_raw',
    'ixc_records_raw',
    'sync_runs',
  ]);
  assert.equal(analyticsTableContract.public.length, 7);
  assert.ok(analyticsTableContract.public.includes('opa_attendances'));
  assert.ok(analyticsTableContract.public.includes('ixc_contracts'));
  assert.ok(analyticsTableContract.public.includes('ixc_cancellations'));
});

test('contrato limita estados de sincronização e exige unicidade da origem', () => {
  assert.deepEqual(analyticsTableContract.syncStatuses, [
    'success',
    'partial',
    'failed',
    'unavailable',
  ]);
  assert.equal(analyticsTableContract.uniqueSourceIdTables.length, 6);
  assert.ok(!analyticsTableContract.syncStatuses.includes('running' as never));
});
