import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreetGeocoder, createGeocodingHandler } from '../../.test-build/viabilidade/geocoding.js';

const input = { street: 'Passagem Floriano', neighborhood: 'Centro', city: 'Capanema' };
const upstreamPlace = { osm_type: 'way', osm_id: 10, lat: '-1.187635', lon: '-47.183039', display_name: 'texto externo ignorado', address: { road: 'Passagem Floriano', suburb: 'Centro', town: 'Capanema', state: 'Pará', country_code: 'br' } };
const place = { id: 'W10', label: 'Passagem Floriano, Centro, Capanema, Pará', city: 'Capanema', location: { latitude: -1.187635, longitude: -47.183039 } };
const request = (body = input, headers = {}) => new Request('https://panel.example/api/viabilidade/endereco', { method: 'POST', headers: { origin: 'https://panel.example', host: 'panel.example', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
function fixture(overrides = {}) {
  const calls = { locate: 0, claim: 0, writes: 0, auth: 0 };
  const deps = {
    authenticate: async () => { calls.auth++; return { id: 'operator' }; },
    claimSlot: async () => { calls.claim++; return true; },
    getCached: async () => null,
    putCached: async () => { calls.writes++; },
    locate: async () => { calls.locate++; return [place]; },
    ...overrides,
  };
  return { handler: createGeocodingHandler(deps), calls };
}

test('busca publica envia somente rua, bairro e cidade e valida localidade da resposta', async () => {
  let searchedUrl;
  const locate = createStreetGeocoder({}, async (url, options) => {
    searchedUrl = new URL(url);
    assert.match(options.headers['user-agent'], /GenteDigital/);
    return Response.json([upstreamPlace, { ...upstreamPlace, osm_id: 11, address: { ...upstreamPlace.address, state: 'Paraná' } }, { ...upstreamPlace, osm_id: 12, address: { ...upstreamPlace.address, town: 'Outra cidade' } }]);
  });
  assert.deepEqual(await locate(input), [place]);
  assert.equal(searchedUrl.searchParams.get('q'), 'Passagem Floriano, Centro, Capanema, Pará, Brasil');
  assert.equal(searchedUrl.searchParams.get('countrycodes'), 'br');
  assert.equal(searchedUrl.searchParams.get('addressdetails'), '1');
});

test('coordenada invalida, latitude vazia e pais errado nunca viram uma localizacao', async () => {
  const locate = createStreetGeocoder({}, async () => Response.json([
    { ...upstreamPlace, lat: '91' }, { ...upstreamPlace, lat: '' },
    { ...upstreamPlace, address: { ...upstreamPlace.address, country_code: 'pt' } },
  ]));
  assert.deepEqual(await locate(input), []);
});

test('autenticacao e CSRF protegem a busca antes de ler cache ou consultar provedor', async () => {
  const unauthorized = fixture({ authenticate: async () => null });
  assert.equal((await unauthorized.handler(request())).status, 401);
  assert.equal(unauthorized.calls.locate, 0);
  const foreign = fixture();
  assert.equal((await foreign.handler(request(input, { origin: 'https://foreign.example' }))).status, 403);
  assert.equal(foreign.calls.claim, 0);
});

test('numero, lead e nomes de cliente nao sao campos aceitos pela busca publica', async () => {
  for (const key of ['number', 'leadId', 'customerName', 'latitude']) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request({ ...input, [key]: '123' }))).status, 400);
    assert.equal(calls.locate, 0);
  }
});

test('busca sem cidade e corpo excessivo nao acionam o provedor', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ street: input.street }))).status, 400);
  assert.equal((await handler(request(input, { 'content-length': '2049' }))).status, 413);
  assert.equal(calls.locate, 0);
});

test('cache evita repetir busca publica e dispensa novo slot global', async () => {
  const { handler, calls } = fixture({ getCached: async () => [place] });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { places: [place], cached: true });
  assert.equal(calls.claim, 0);
  assert.equal(calls.locate, 0);
});

test('limite global ocupado retorna retry-after e nao consulta o provedor', async () => {
  const { handler, calls } = fixture({ claimSlot: async () => false });
  const response = await handler(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '2');
  assert.equal(calls.locate, 0);
});

test('busca aceita centro de cidade somente como localizacao inicial para ajuste', async () => {
  const { handler } = fixture();
  assert.equal((await handler(request({ street: '', neighborhood: '', city: 'Capanema' }))).status, 200);
});

test('falhas de cache, controle global e provedor nao retornam localizacao ficticia', async () => {
  for (const method of ['getCached', 'claimSlot', 'locate', 'putCached']) {
    const { handler } = fixture({ [method]: async () => { throw Error('private diagnostic'); } });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'ADDRESS_SEARCH_UNAVAILABLE' });
  }
});

test('busca nova escreve cache publico e nao inclui campos privados na resposta', async () => {
  const { handler, calls } = fixture();
  const response = await handler(request());
  assert.deepEqual(await response.json(), { places: [place], cached: false });
  assert.equal(calls.writes, 1);
  assert.equal(calls.claim, 1);
});

test('corpo sem content-length excedente e resposta publica nao JSON sao recusados', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ ...input, street: 'a'.repeat(3000) }))).status, 413);
  assert.equal(calls.locate, 0);
  const locate = createStreetGeocoder({}, async () => new Response('<html>erro</html>', { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(locate(input));
});
