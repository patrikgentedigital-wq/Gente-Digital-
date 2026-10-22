import test from 'node:test';
import assert from 'node:assert/strict';
import { createIxcHttpClient } from '../../.test-build/viabilidade/adapters/ixc-http.js';
import { createIxcAdapter } from '../../.test-build/viabilidade/adapters/ixc.js';

const selectors = {
  AC: { field: 'id_projeto', values: ['10'] },
  CP: { field: 'id_projeto', values: ['20'] }
};
const options = { baseUrl: 'https://ixc.example.invalid', webserviceToken: '42:synthetic-only', regionSelectors: selectors, pageSize: 2 };
const record = (id, changes = {}) => ({
  id: String(id), descricao: 'AC-CTO N0' + id, status: 'A', capacidade: '16',
  latitude: '-1.02', longitude: '-46.63', id_projeto: '10',
  obs_caixa_ftth: 'PRIVATE NOTE', endereco: 'PRIVATE ADDRESS', ...changes
});
const signal = () => new AbortController().signal;

test('cliente IXC usa rota oficial, Basic Auth e POST exclusivamente de listagem', async () => {
  let captured;
  const client = createIxcHttpClient(options, async (url, init) => {
    captured = { url: String(url), init };
    return Response.json({ page: '1', total: '3', registros: [record(1), record(2)] });
  });
  const page = await client.listCaixas('AC', undefined, signal());
  assert.equal(captured.url, 'https://ixc.example.invalid/webservice/v1/rad_caixa_ftth');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.redirect, 'error');
  assert.equal(captured.init.headers.ixcsoft, 'listar');
  assert.equal(captured.init.headers.authorization, 'Basic ' + Buffer.from(options.webserviceToken).toString('base64'));
  const body = JSON.parse(captured.init.body);
  assert.equal(body.qtype, 'rad_caixa_ftth.id');
  assert.equal(body.sortorder, 'asc');
  assert.equal(body.page, '1');
  assert.deepEqual(JSON.parse(body.grid_param), [{ TB: 'rad_caixa_ftth.id_projeto', OP: 'IN', P: '10' }]);
  assert.equal(page.nextPageToken, '2:3');
  assert.deepEqual(page.rows[0], { id: '1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: { latitude: -1.02, longitude: -46.63 } });
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
  assert.equal('available' in page.rows[0], false);
});

test('cliente IXC percorre total exato e reprova total instável ou página faltante', async () => {
  const calls = [];
  const client = createIxcHttpClient(options, async (_url, init) => {
    const page = Number(JSON.parse(init.body).page);
    calls.push(page);
    return Response.json({ page, total: 3, registros: page === 1 ? [record(1), record(2)] : [record(3)] });
  });
  const snapshot = await createIxcAdapter(client).loadIxc('AC');
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.rows.length, 3);
  assert.deepEqual(calls, [1, 2]);
  for (const response of [
    { page: 2, total: 4, registros: [record(3), record(4)] },
    { page: 2, total: 3, registros: [] },
    { page: 1, total: 3, registros: [record(3)] }
  ]) {
    const bad = createIxcHttpClient(options, async (_url, init) => Number(JSON.parse(init.body).page) === 1
      ? Response.json({ page: 1, total: 3, registros: [record(1), record(2)] }) : Response.json(response));
    assert.equal((await createIxcAdapter(bad).loadIxc('AC')).complete, false);
  }
});

test('cliente IXC preserva coordenada ausente e recusa status, região ou envelope não comprovados', async () => {
  const missing = createIxcHttpClient(options, async () => Response.json({ page: 1, total: 1, registros: [record(1, { latitude: '', longitude: '' })] }));
  assert.equal((await missing.listCaixas('AC', undefined, signal())).rows[0].location, null);
  for (const payload of [
    { page: 1, total: 1, registros: [record(1, { status: '?' })] },
    { page: 1, total: 1, registros: [record(1, { id_projeto: '20' })] },
    { page: 1, total: 1, registros: [record(1, { latitude: 'invalid' })] },
    { page: 1, registros: [record(1)] },
    { type: 'error', message: 'PRIVATE UPSTREAM ERROR' }
  ]) {
    const bad = createIxcHttpClient(options, async () => Response.json(payload));
    await assert.rejects(bad.listCaixas('AC', undefined, signal()), error => !error.message.includes('PRIVATE'));
  }
});

test('cliente IXC repete uma falha transitória e não repete falta de permissão', async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const client = createIxcHttpClient(options, async () => { calls++; return new Response('PRIVATE', { status }); });
    await assert.rejects(client.listCaixas('AC', undefined, signal()));
    assert.equal(calls, 1);
  }
  for (const status of [429, 500]) {
    let calls = 0;
    const client = createIxcHttpClient(options, async () => {
      calls++;
      return calls === 1 ? new Response('', { status }) : Response.json({ page: 1, total: 1, registros: [record(1)] });
    });
    assert.equal((await client.listCaixas('AC', undefined, signal())).rows.length, 1);
    assert.equal(calls, 2);
  }
  let exhaustedCalls = 0;
  const exhausted = createIxcHttpClient(options, async () => { exhaustedCalls++; return new Response('', { status: 503 }); });
  await assert.rejects(exhausted.listCaixas('AC', undefined, signal()));
  assert.equal(exhaustedCalls, 2);
});

test('erro declarado pelo IXC nunca vira snapshot completo mesmo com envelope válido', async () => {
  const client = createIxcHttpClient(options, async () => Response.json({
    type: 'error', message: 'PRIVATE UPSTREAM ERROR', page: 1, total: 1, registros: [record(1)]
  }));
  const snapshot = await createIxcAdapter(client).loadIxc('AC');
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.rows.length, 0);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
});

test('cliente IXC não consulta com sinal cancelado nem configuração insegura ou regiões sobrepostas', async () => {
  let calls = 0;
  const client = createIxcHttpClient(options, async () => { calls++; return Response.json({}); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.listCaixas('AC', undefined, controller.signal));
  assert.equal(calls, 0);
  for (const change of [
    { baseUrl: 'http://ixc.example.invalid' },
    { baseUrl: 'https://user:password@ixc.example.invalid' },
    { baseUrl: 'https://ixc.example.invalid/another-resource' },
    { webserviceToken: 'invalid' },
    { regionSelectors: { AC: selectors.AC, CP: selectors.AC } },
    { regionSelectors: { AC: selectors.AC, CP: { field: 'id_cidade', values: ['20'] } } },
    { regionSelectors: { AC: { field: 'id_projeto', values: [] }, CP: selectors.CP } }
  ]) assert.throws(() => createIxcHttpClient({ ...options, ...change }));
});
