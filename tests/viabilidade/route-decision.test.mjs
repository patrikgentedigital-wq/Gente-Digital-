import test from 'node:test';
import assert from 'node:assert/strict';

const now = new Date('2026-10-06T12:00:00.000Z');
const install = { latitude: 0, longitude: 0.001 };
const ctoLocation = { latitude: 0, longitude: 0 };
const policy = {
  maxDistanceMeters: 500,
  maxUpdateAgeDays: null,
  freshnessMode: 'CURRENT_SNAPSHOT',
  version: 'test-current-snapshot',
  regionalCoverageConfirmed: true,
};

function evaluationFixture({ ixcCapacity = 8, sheetCapacity = 8, completeNetwork = true, available = 2,
  candidateLocation = ctoLocation, installLocation = install } = {}) {
  const ixc = {
    rows: [{ id: '389', originalName: 'N083-1X8', region: 'CP', active: true, capacity: ixcCapacity, location: candidateLocation }],
    fetchedAt: now.toISOString(), complete: true, origin: 'LIVE', issues: [],
  };
  const sheets = {
    rows: [{ originalName: 'N-83', region: 'CP', available, capacity: sheetCapacity, location: candidateLocation,
      updatedOn: '2026-10-06', observations: [], sheet: 'CTO,s CP', row: 84, issues: [] }],
    fetchedAt: now.toISOString(), complete: true, origin: 'LIVE', issues: [],
  };
  const sources = { loadIxc: async () => ixc, loadSheets: async () => sheets };
  const network = {
    poles: [],
    cables: [{ id: 'cable-1', name: 'Cabo principal', points: [
      candidateLocation, { latitude: 0.0005, longitude: 0.0005 }, installLocation,
    ] }],
    cableCount: 1, complete: completeNetwork, issues: [], fetchedAt: now.toISOString(),
  };
  return { sources, network };
}

function graphFixture({ candidateLocation = ctoLocation, installLocation = install, disconnected = false } = {}) {
  const nodes = disconnected
    ? [
      { id: 'road-a-start', location: { latitude: -0.001, longitude: 0.0005 } },
      { id: 'road-a-end', location: { latitude: 0.001, longitude: 0.0005 } },
      { id: 'road-b-start', location: { latitude: 0.0005, longitude: -0.001 } },
      { id: 'road-b-end', location: { latitude: 0.0005, longitude: 0.001 } },
    ]
    : [
      { id: 'cto', location: candidateLocation },
      { id: 'middle', location: { latitude: 0.0005, longitude: 0.0005 } },
      { id: 'install', location: installLocation },
    ];
  const edges = disconnected
    ? [
      { id: 'a-1', wayId: 'way-a', from: 'road-a-start', to: 'road-a-end' },
      { id: 'b-1', wayId: 'way-b', from: 'road-b-start', to: 'road-b-end' },
    ]
    : [
      { id: 'a-1', wayId: 'way-a', from: 'cto', to: 'middle' },
      { id: 'a-2', wayId: 'way-a', from: 'middle', to: 'install' },
    ];
  return {
    schemaVersion: 1,
    region: 'CP',
    graphVersion: 'osm-test-v1',
    snapshotAt: now.toISOString(),
    coverage: { type: 'Polygon', coordinates: [[[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01], [-0.01, -0.01]]] },
    nodes,
    edges,
  };
}

test('avalia automaticamente a metragem FiberDocs e aprova dentro dos 500 m quando fontes concordam', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const { sources, network } = evaluationFixture();
  const { decision: output, network: returnedNetwork } = await evaluate({ region: 'CP', location: install }, sources, policy, [], now, 'LIVE', async () => network);
  const candidate = output.candidates[0];

  assert.equal(returnedNetwork, network);
  assert.equal(output.status, 'VIAVEL');
  assert.equal(candidate.status, 'VIAVEL');
  assert.equal(candidate.routeSource, 'FIBERDOCS_ESTIMATE');
  assert.ok(candidate.routeMeters > 177.1 && candidate.routeMeters < 177.4);
  assert.ok(candidate.geographicMeters < candidate.routeMeters);
});

test('mantém análise técnica se IXC e planilha divergirem mesmo com rota calculada', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const { sources, network } = evaluationFixture({ ixcCapacity: 16, sheetCapacity: 8 });
  const { decision: output } = await evaluate({ region: 'CP', location: install }, sources, policy, [], now, 'LIVE', async () => network);
  const candidate = output.candidates[0];

  assert.equal(output.status, 'ANALISE_TECNICA');
  assert.equal(candidate.routeSource, 'FIBERDOCS_ESTIMATE');
  assert.ok(candidate.routeMeters > 177.1 && candidate.routeMeters < 177.4);
  assert.equal(candidate.ixcCapacity, 16);
  assert.equal(candidate.sheetCapacity, 8);
  assert.ok(candidate.reasons.includes('CAPACIDADE_DIVERGENTE'));
});

test('não aprova por um caminho aparente quando a leitura FiberDocs está incompleta', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const { sources, network } = evaluationFixture({ completeNetwork: false });
  const { decision: output } = await evaluate({ region: 'CP', location: install }, sources, policy, [], now, 'LIVE', async () => network);

  assert.equal(output.status, 'ANALISE_TECNICA');
  assert.equal(output.candidates[0].routeSource, null);
  assert.equal(output.candidates[0].routeMeters, null);
});

test('adiciona exatamente 20 m de reserva à estimativa automática FiberDocs', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const { sources, network } = evaluationFixture();
  const { decision } = await evaluate({ region: 'CP', location: install }, sources, policy, [], now, 'LIVE', async () => network);
  const candidate = decision.candidates[0];

  assert.equal(candidate.routeComponents.reserveMeters, 20);
  assert.equal(candidate.routeMeters, candidate.routeComponents.totalMeters);
  assert.ok(candidate.routeMeters > 177.1 && candidate.routeMeters < 177.4);
});

test('usa rota OSM quando FiberDocs não está configurado e mantém análise técnica', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const { sources } = evaluationFixture();
  const graph = graphFixture();
  const { decision, routeGeometries } = await evaluate({ region: 'CP', location: install }, sources, policy, [], now, 'LIVE', undefined, async () => graph);
  const candidate = decision.candidates[0];

  assert.equal(candidate.routeSource, 'OSM_ESTIMATE');
  assert.equal(candidate.status, 'ANALISE_TECNICA');
  assert.equal(decision.status, 'ANALISE_TECNICA');
  assert.equal(candidate.routeComponents.reserveMeters, 20);
  assert.equal(candidate.routeMeters, candidate.routeComponents.totalMeters);
  assert.equal(routeGeometries[0].source, 'OSM_ESTIMATE');
  assert.ok(routeGeometries[0].points.length >= 3);
  assert.equal(decision.sources.roadGraphVersion, 'osm-test-v1');
});

test('não conecta cruzamentos geométricos sem nó OSM compartilhado', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const start = { latitude: 0.0004, longitude: 0.0005 };
  const target = { latitude: 0.0005, longitude: 0.0004 };
  const { sources } = evaluationFixture({ candidateLocation: target, installLocation: start });
  const graph = graphFixture({ candidateLocation: target, installLocation: start, disconnected: true });
  const { decision, routeGeometries } = await evaluate({ region: 'CP', location: start }, sources, policy, [], now, 'LIVE', undefined, async () => graph);

  assert.equal(decision.candidates[0].routeMeters, null);
  assert.ok(decision.candidates[0].reasons.includes('OSM_SEM_CAMINHO_CONTINUO'));
  assert.deepEqual(routeGeometries, []);
});

test('não cria acesso artificial quando imóvel fica a mais de 30 m da rua', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const point = { latitude: 0.0005, longitude: 0.0015 };
  const { sources } = evaluationFixture({ installLocation: point });
  const graph = graphFixture();
  const { decision, routeGeometries } = await evaluate({ region: 'CP', location: point }, sources, policy, [], now, 'LIVE', undefined, async () => graph);

  assert.equal(decision.candidates[0].routeMeters, null);
  assert.ok(decision.candidates[0].reasons.includes('OSM_ENCAIXE_FORA_DA_VIA'));
  assert.deepEqual(routeGeometries, []);
});

test('OSM acima de 500 m mantém análise técnica e registra o limite excedido', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const { sources } = evaluationFixture();
  const graph = graphFixture();
  graph.nodes = [
    { id: 'cto', location: ctoLocation },
    { id: 'north-west', location: { latitude: 0.004, longitude: 0 } },
    { id: 'north-east', location: { latitude: 0.004, longitude: 0.001 } },
    { id: 'install', location: install },
  ];
  graph.edges = [
    { id: 'detour-1', wayId: 'detour', from: 'cto', to: 'north-west' },
    { id: 'detour-2', wayId: 'detour', from: 'north-west', to: 'north-east' },
    { id: 'detour-3', wayId: 'detour', from: 'north-east', to: 'install' },
  ];
  const { decision } = await evaluate({ region: 'CP', location: install }, sources, policy, [], now, 'LIVE', undefined, async () => graph);
  const candidate = decision.candidates[0];

  assert.ok(candidate.routeMeters > 500);
  assert.equal(candidate.status, 'ANALISE_TECNICA');
  assert.equal(decision.recommendedCtoId, null);
  assert.ok(candidate.reasons.includes('OSM_ESTIMATIVA_ACIMA_DO_LIMITE'));
});

test('bloqueio independente de sem vagas permanece aplicável a uma rota OSM', async () => {
  const { evaluate } = await import('../../.test-build/viabilidade/service.js');
  const { sources } = evaluationFixture({ available: 0 });
  const graph = graphFixture();
  const { decision } = await evaluate({ region: 'CP', location: install }, sources, policy, [], now, 'LIVE', undefined, async () => graph);

  assert.equal(decision.candidates[0].routeSource, 'OSM_ESTIMATE');
  assert.equal(decision.candidates[0].status, 'INVIAVEL');
  assert.ok(decision.candidates[0].reasons.includes('SEM_VAGAS'));
});
