import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadCancellationMetrics } from '../../lib/analytics/commercial-ixc';

const october = { from: '2026-10-01', to: '2026-10-31' };

test('conta cancelamentos de todos os status pela data e agrupa pelos motivos cadastrados', async () => {
  const result = await loadCancellationMetrics(october, async (table, body) => {
    if (table === 'fn_areceber_mot_cancelamento') {
      return { total: '1', registros: [{ id: '7', motivo: ' Débito ' }] };
    }
    assert.equal(table, 'cliente_contrato');
    assert.equal(body.qtype, 'cliente_contrato.data_cancelamento');
    assert.equal(body.query, '2026-10-01');
    assert.deepEqual(JSON.parse(body.grid_param), [
      { TB: 'cliente_contrato.data_cancelamento', OP: '<', P: '2026-11-01' },
    ]);
    return { total: '3', registros: [
      { id: '1', status: 'I', data_cancelamento: '2026-10-01', motivo_cancelamento: '7', id_cliente: '54' },
      { id: '2', status: 'N', data_cancelamento: '2026-10-31', motivo_cancelamento: '7' },
      { id: '3', data_cancelamento: '2026-10-31', motivo_cancelamento: '0' },
    ] };
  });
  assert.deepEqual(result, { total: 3, byReason: [
    { key: 'Débito', count: 2 }, { key: 'Sem motivo', count: 1 },
  ] });
});

test('preserva a contagem quando o catálogo de motivos está indisponível', async () => {
  const result = await loadCancellationMetrics(october, async (table) => {
    if (table === 'fn_areceber_mot_cancelamento') throw new Error('catálogo indisponível');
    return { total: 1, registros: [{ id: '1', data_cancelamento: '2026-10-31', motivo_cancelamento: '7' }] };
  });
  assert.deepEqual(result, { total: 1, byReason: null });
});

test('distingue zero real de uma resposta incompleta do IXC', async () => {
  assert.deepEqual(await loadCancellationMetrics(october, async () => ({ total: '0' })), { total: 0, byReason: [] });
  await assert.rejects(loadCancellationMetrics(october, async () => ({ total: '1' })), /incompleta/);
});
