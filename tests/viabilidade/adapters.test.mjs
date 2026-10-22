import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createIxcAdapter } from '../../.test-build/viabilidade/adapters/ixc.js';
import { createServiceAccountTokenProvider, createSheetsAdapter } from '../../.test-build/viabilidade/adapters/sheets.js';

const time = () => new Date('2026-09-04T12:00:00.000Z');
function cto(id, region = 'AC') {
  return { id, originalName: region + '-CTO N01', region, active: true, capacity: 16, location: { latitude: -1.02, longitude: -46.63 } };
}
const acHeaders = ['Nº CTO', 'SPLITT.', 'VAGAS', 'OLT', 'VLAN/PON', 'LUZ', 'LOC / INMAP', 'BAIRRO/RUA', 'TÉC.', 'COM CÓD.', 'ATUALIZADO', 'ALTERADO', 'COR DA FIBRA', 'LOG / CÓD.'];
const acRow = ['N-01', '1X16', '3', 'AC', '1601', '-20', '-1.02, -46.63', 'Rua B', '', 'APENAS 8', '03/09/2026', 'PRIVATE_USER', 'FIBRA VIOLETA', '1 porta com loss'];

test('IXC percorre todas as páginas com token e retorna um snapshot completo', async () => {
  const calls = [];
  const adapter = createIxcAdapter({ async listCaixas(region, token) {
    calls.push([region, token]);
    return token ? { rows: [cto('2')] } : { rows: [cto('1')], nextPageToken: 'next' };
  } }, time);
  const result = await adapter.loadIxc('AC');
  assert.deepEqual(calls, [['AC', undefined], ['AC', 'next']]);
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 2);
});

test('IXC paginação repetida e IDs duplicados deixam a fonte incompleta', async () => {
  const repeated = createIxcAdapter({ async listCaixas(_region, _token) {
    return { rows: [], nextPageToken: 'same' };
  } }, time);
  assert.equal((await repeated.loadIxc('AC')).complete, false);

  const duplicate = createIxcAdapter({ async listCaixas() {
    return { rows: [cto('1'), cto('1')] };
  } }, time);
  assert.equal((await duplicate.loadIxc('AC')).complete, false);
});

test('IXC cancela e marca a fonte incompleta quando uma página excede o timeout', async () => {
  let receivedSignal;
  const slow = createIxcAdapter({
    async listCaixas(_region, _token, signal) {
      receivedSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve({ rows: [cto('late')] }), 40));
    }
  }, time, 5);
  const result = await slow.loadIxc('AC');
  assert.equal(result.complete, false);
  assert.deepEqual(result.issues, ['IXC_READ_FAILED']);
  assert.equal(receivedSignal.aborted, true);
});

test('conta de serviço solicita escopo de somente leitura e guarda token em cache', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let calls = 0;
  let assertionClaims;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(new URL(url).hostname, 'oauth2.googleapis.com');
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = form.get('assertion');
    const encodedClaims = assertion.split('.')[1];
    assertionClaims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
    return Response.json({ access_token: 'temporary-test-token', expires_in: 3600 });
  };
  let currentSeconds = 1000;
  const provider = createServiceAccountTokenProvider(JSON.stringify({
    client_email: 'readonly@example.invalid', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  }), fetcher, () => currentSeconds);
  assert.equal(await provider(), 'temporary-test-token');
  assert.equal(await provider(), 'temporary-test-token');
  assert.equal(calls, 1);
  assert.equal(assertionClaims.scope, 'https://www.googleapis.com/auth/spreadsheets.readonly');
  currentSeconds += 3600;
  assert.equal(await provider(), 'temporary-test-token');
  assert.equal(calls, 2);
});

test('Google Sheets lê em blocos e retorna apenas códigos de observação', async () => {
  const requests = [];
  const matrix = [[], [], acHeaders, acRow];
  const fetcher = async (input, init) => {
    const url = new URL(input);
    requests.push({ url, auth: init.headers.authorization });
    if (!url.pathname.includes('/values/')) {
      return Response.json({ sheets: [{ properties: { title: 'CTO,s AC', gridProperties: { rowCount: 802, columnCount: 18 } } }] });
    }
    const decodedRange = decodeURIComponent(url.pathname.split('/values/')[1].replaceAll('%27', "'"));
    if (decodedRange.includes('A1:O400')) return Response.json({ values: matrix });
    return Response.json({});
  };
  const adapter = createSheetsAdapter(
    '1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ',
    async () => 'temporary-test-token', fetcher, time
  );
  const snapshot = await adapter.loadSheets('AC');
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.rows.length, 1);
  assert.deepEqual(snapshot.rows[0].observations, ['RESTRICAO_FIBRA_OU_SINAL']);
  assert.equal(JSON.stringify(snapshot).includes('1 porta com loss'), false);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE_USER'), false);
  const valueCalls = requests.filter((request) => request.url.pathname.includes('/values/'));
  assert.equal(valueCalls.length, 3);
  assert.ok(valueCalls.every((request) => request.auth === 'Bearer temporary-test-token'));
});

test('Google Sheets recusa esquema alterado e não repete erros de permissão', async () => {
  let calls = 0;
  const forbidden = createSheetsAdapter(
    '1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ', async () => 'fake',
    async () => { calls++; return new Response('', { status: 403 }); }, time
  );
  assert.equal((await forbidden.loadSheets('AC')).complete, false);
  assert.equal(calls, 1);

  const changed = createSheetsAdapter(
    '1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ', async () => 'fake',
    async (input) => new URL(input).pathname.includes('/values/')
      ? Response.json({ values: [['header changed']] })
      : Response.json({ sheets: [{ properties: { title: 'CTO,s AC', gridProperties: { rowCount: 761, columnCount: 18 } } }] }), time
  );
  const result = await changed.loadSheets('AC');
  assert.equal(result.complete, false);
  assert.ok(result.issues.includes('ESQUEMA_PLANILHA_ALTERADO'));
});

test('erro transitório HTTP é repetido uma vez e depois tratado com segurança', async () => {
  let calls = 0;
  const retried = createSheetsAdapter(
    '1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ', async () => 'fake',
    async (input) => {
      calls++;
      if (calls === 1) return new Response('', { status: 503 });
      const url = new URL(input);
      return url.pathname.includes('/values/')
        ? Response.json({ values: [[], [], acHeaders, acRow] })
        : Response.json({ sheets: [{ properties: { title: 'CTO,s AC', gridProperties: { rowCount: 4, columnCount: 18 } } }] });
    }, time
  );
  const result = await retried.loadSheets('AC');
  assert.equal(result.complete, true);
  assert.equal(calls, 3);
});
