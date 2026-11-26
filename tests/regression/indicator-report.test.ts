import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadIndicatorReport } from '../../lib/analytics/indicator-report';
import { loadCancellationMetrics } from '../../lib/analytics/commercial-ixc';

const period = { from: '2026-10-01', to: '2026-10-03' };
const readAt = '2026-11-01T13:00:00Z';
const record = { id: '123', date: period.from, channel: '2', channelName: 'Loja', responsible: '5', responsibleName: 'Equipe A' };
const section = (input: RequestInfo | URL) => new URL(String(input), 'https://example.test').searchParams;
const payload = (metrics: unknown) => Response.json({ metrics, readAt });

test('relatório consolidado conserva registros, separa origens e usa o período escolhido por inteiro', async t => {
  const requests: URLSearchParams[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    const q = section(url);
    requests.push(q);
    const previous = q.has('summary');
    if (q.has('section')) return payload(previous ? { total: 0 } : { total: 1,
      byReason: [{ key: 'Mudança', count: 1 }], records: [{ id: '34', date: period.to, reason: 'Mudança' }] });
    return payload(previous ? { leads: 50, sales: 0, contracts: null } : {
      leads: Array.from({ length: 51 }, (_, index) => ({ ...record, id: String(index + 10) })),
      sales: [], contracts: [{ ...record, channel: null, channelName: null, responsibleName: null }],
    });
  });
  const report = await loadIndicatorReport(period, 'consolidado', new AbortController().signal);
  const table = (name: string) => report.tables.find(item => item.title === name)!;
  assert.deepEqual(report.compared, { from: '2026-09-28', to: '2026-09-30' });
  assert.equal(requests.length, 4);
  assert.equal(requests.filter(q => q.has('details')).length, 1);
  assert.equal(table('Leads recebidos').rows.length, 51);
  assert.deepEqual(table('Resumo').rows[0], ['Leads recebidos', 51, 50, 1, 0.02, 17]);
  assert.deepEqual(table('Resumo').rows[3], ['Cancelamentos', 1, 0, 1, null, 1 / 3]);
  assert.equal(table('Resumo').rows[2][2], null);
  assert(report.notes.some(note => note.includes('Comparação indisponível para Contratos criados')));
  assert.deepEqual(table('Evolução diária').rows, [
    [period.from, 51, 0, 1, 0], ['2026-10-02', 0, 0, 0, 0], [period.to, 0, 0, 0, 1],
  ]);
  assert.deepEqual(table('Por canal').rows, [['Leads recebidos', '2', 'Loja', 51, 1]]);
  assert.deepEqual(table('Por responsável').rows[1], ['Contratos criados', '5', 'Nome indisponível (ref. 5)', 1, 1]);
  assert.deepEqual(table('Motivos de cancelamento').rows, [['Mudança', 1, 1]]);
  assert.deepEqual(table('Cancelamentos').rows, [['34', period.to, 'Mudança']]);
});

test('dados parciais do período ou contagem sem os registros correspondentes impedem a exportação', async t => {
  const current = t.mock.method(globalThis, 'fetch', async () => payload({ leads: null, sales: [], contracts: [] }));
  const signal = new AbortController().signal;
  await assert.rejects(loadIndicatorReport(period, 'vendas', signal), /parciais/);
  assert.equal(current.mock.callCount(), 1);
  current.mock.mockImplementation(async () => payload({ total: 1, byReason: [], records: [] }));
  await assert.rejects(loadIndicatorReport(period, 'cancelamentos', signal), /incompleto/);
});

test('compara apenas quando disponível e recusa exportação se a sessão expirou durante a comparação', async t => {
  let status = 503;
  const calls: URLSearchParams[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    const params = section(url);
    calls.push(params);
    return params.has('summary') ? new Response(null, { status }) : payload({ total: 0, byReason: [], records: [] });
  });
  const signal = new AbortController().signal;
  const report = await loadIndicatorReport(period, 'cancelamentos', signal);
  assert.equal(report.tables[0].rows[0][2], null);
  assert.deepEqual(report.tables.map(t => t.title), ['Resumo', 'Evolução diária', 'Motivos de cancelamento', 'Cancelamentos']);
  assert(calls.every(q => q.get('section') === 'cancelamentos'));
  status = 401;
  await assert.rejects(loadIndicatorReport(period, 'cancelamentos', signal), /conta administrativa/);
});

test('detalhe de cancelamento projeta somente ID, data e motivo, sem repetir dados de cliente', async () => {
  const result = await loadCancellationMetrics(period, async table => table === 'cliente_contrato'
    ? { total: 1, registros: [{ id: '42', data_cancelamento: period.to, motivo_cancelamento: '8', id_cliente: '18' }] }
    : { total: 1, registros: [{ id: '8', motivo: 'Solicitação' }] }, true, true);
  assert.deepEqual(result.records, [{ id: '42', date: period.to, reason: 'Solicitação' }]);
  assert.equal(result.total, 1);
  assert.deepEqual(result.byReason, [{ key: 'Solicitação', count: 1 }]);
});
