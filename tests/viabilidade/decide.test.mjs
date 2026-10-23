import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../.test-build/viabilidade/domain/decide.js';

const now = new Date('2026-09-04T12:00:00.000Z');
const point = { latitude: -1.02367, longitude: -46.63678 };
const policy = { maxDistanceMeters: 500, maxUpdateAgeDays: 30, version: 'v1', regionalCoverageConfirmed: true };
function fixture({ available = 2, updatedOn = '2026-09-03', rowIssues = [], routeMeters = 25,
  routeLocation = point, complete = true, observations = [], capacity = 16, otherCto = null, ctoLocation = point, sheetLocation = ctoLocation } = {}) {
  const ctos = [{ id: 'cto-1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity, location: ctoLocation }];
  const rows = [{ originalName: 'N-01', region: 'AC', available, capacity, location: sheetLocation, updatedOn, observations, sheet: 'CTO,s AC', row: 4, issues: rowIssues, olt: 'AC', pon: '1601' }];
  if (otherCto) { ctos.push(otherCto.cto); rows.push(otherCto.row); }
  const ixc = { rows: ctos, fetchedAt: now.toISOString(), complete, origin: 'DEMO', issues: [] };
  const sheets = { rows, fetchedAt: now.toISOString(), complete, origin: 'DEMO', issues: [] };
  const routes = routeMeters === null ? [] : [{ ctoId: 'cto-1', location: routeLocation, meters: routeMeters, confirmedAt: now.toISOString(), reference: 'OS-TESTE-1' }];
  return decide({ region: 'AC', location: point }, ixc, sheets, routes, policy, now);
}

test('trajeto confirmado até 500 m inclusive viabiliza; 501 m reprova a CTO', () => {
  assert.equal(fixture({ routeMeters: 500 }).status, 'VIAVEL');
  const outside = fixture({ routeMeters: 501 });
  assert.equal(outside.status, 'INVIAVEL');
  assert.ok(outside.candidates[0].reasons.includes('TRAJETO_FORA_DO_LIMITE'));
});

test('resultado expõe a identificação da CTO associada na planilha', () => {
  const result = fixture();
  assert.equal(result.candidates[0].sheetCtoName, 'N-01');
  assert.equal(result.candidates[0].sheet, 'CTO,s AC');
  assert.equal(result.candidates[0].row, 4);
});

test('distância geográfica curta sem trajeto confirmado exige análise técnica', () => {
  const result = fixture({ routeMeters: null });
  assert.equal(result.status, 'ANALISE_TECNICA');
  assert.ok(result.candidates[0].reasons.includes('TRAJETO_NAO_CONFIRMADO'));
});

test('metragem FiberDocs continua visivel quando a CTO ainda nao foi associada a planilha', () => {
  const cto = { id: 'cto-1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: point };
  const ixc = { rows: [cto], fetchedAt: now.toISOString(), complete: true, origin: 'LIVE', issues: [] };
  const sheets = { rows: [], fetchedAt: now.toISOString(), complete: true, origin: 'LIVE', issues: [] };
  const result = decide({ region: 'AC', location: point }, ixc, sheets, [], policy, now,
    [{ ctoId: 'cto-1', location: point, meters: 120 }], 'REDE_SEM_CAMINHO_CONTINUO');

  assert.equal(result.status, 'ANALISE_TECNICA');
  assert.equal(result.candidates[0].routeMeters, 120);
  assert.equal(result.candidates[0].routeSource, 'FIBERDOCS_ESTIMATE');
  assert.ok(result.candidates[0].reasons.includes('CTO_AUSENTE_NA_PLANILHA'));
});

test('data ausente, futura, antiga ou política de validade ausente impede aprovação', () => {
  assert.equal(fixture({ updatedOn: null }).status, 'ANALISE_TECNICA');
  assert.equal(fixture({ updatedOn: '2026-09-05' }).status, 'ANALISE_TECNICA');
  assert.equal(fixture({ updatedOn: '2026-07-01' }).status, 'ANALISE_TECNICA');
  const result = fixture();
  const noPolicy = { ...policy, maxUpdateAgeDays: null };
  const cto = { id: 'cto-1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: point };
  const row = { originalName: 'N-01', region: 'AC', available: 2, capacity: 16, location: point, updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 4, issues: [] };
  result.status = decide({ region: 'AC', location: point },
    { rows: [cto], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    { rows: [row], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    [{ ctoId: 'cto-1', location: point, meters: 20, confirmedAt: now.toISOString(), reference: 'OS' }], noPolicy, now).status;
  assert.equal(result.status, 'ANALISE_TECNICA');
});

test('zero vagas atuais invalida a candidata; valores ausentes ou acima da capacidade exigem análise', () => {
  const zero = fixture({ available: 0 });
  assert.equal(zero.status, 'INVIAVEL');
  assert.ok(zero.candidates[0].reasons.includes('SEM_VAGAS'));
  assert.equal(fixture({ available: 0, routeMeters: null }).status, 'INVIAVEL');
  assert.equal(fixture({ available: 17, capacity: 16 }).status, 'ANALISE_TECNICA');
  assert.equal(fixture({ available: null }).status, 'ANALISE_TECNICA');
});

test('fontes incompletas ou cobertura regional não confirmada nunca aprovam', () => {
  assert.equal(fixture({ complete: false }).status, 'ANALISE_TECNICA');
  const cto = { id: 'cto-1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: point };
  const row = { originalName: 'N-01', region: 'AC', available: 2, capacity: 16, location: point, updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 4, issues: [] };
  const result = decide({ region: 'AC', location: point },
    { rows: [cto], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    { rows: [row], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    [{ ctoId: 'cto-1', location: point, meters: 20, confirmedAt: now.toISOString(), reference: 'OS' }],
    { ...policy, regionalCoverageConfirmed: false }, now);
  assert.equal(result.status, 'ANALISE_TECNICA');
});

test('rota precisa estar amarrada ao mesmo ponto consultado', () => {
  const result = fixture({ routeLocation: { latitude: point.latitude + 0.01, longitude: point.longitude } });
  assert.equal(result.status, 'ANALISE_TECNICA');
});

test('duas evidências de trajeto conflitantes exigem análise técnica', () => {
  const result = fixture();
  const cto = { id: 'cto-1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: point };
  const row = { originalName: 'N-01', region: 'AC', available: 2, capacity: 16, location: point, updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 4, issues: [] };
  const evidence = { ctoId: 'cto-1', location: point, meters: 25, confirmedAt: now.toISOString(), reference: 'OS' };
  const decision = decide({ region: 'AC', location: point },
    { rows: [cto], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    { rows: [row], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    [evidence, { ...evidence, meters: 800 }], policy, now);
  assert.equal(decision.status, 'ANALISE_TECNICA');
});

test('restrição em código e observação maliciosa não viram aprovação nem vazam texto', () => {
  const result = fixture({ rowIssues: ['RESTRICAO_SEM_ACOPLADOR', 'OBSERVACAO_PENDENTE_REVISAO'] });
  assert.equal(result.status, 'ANALISE_TECNICA');
  assert.ok(result.candidates[0].reasons.includes('RESTRICAO_PENDENTE_REVISAO'));
  assert.equal(JSON.stringify(result).includes('INSTRUCAO MALICIOSA'), false);
});

test('uma candidata válida pode ser recomendada apesar de outra ambígua', () => {
  const secondPoint = { latitude: point.latitude + 0.001, longitude: point.longitude };
  const result = fixture({ otherCto: {
    cto: { id: 'cto-2', originalName: 'AC-CTO N02', region: 'AC', active: true, capacity: 16, location: secondPoint },
    row: { originalName: 'N-02', region: 'AC', available: 3, capacity: 16, location: secondPoint, updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 5, issues: [] }
  } });
  assert.equal(result.status, 'VIAVEL');
  assert.equal(result.recommendedCtoId, 'cto-1');
  assert.match(result.id, /^[0-9a-f-]{36}$/);
});

test('CTO ambígua ou coordenada ausente não produzem uma conclusão falsa', () => {
  const result = fixture({ otherCto: {
    cto: { id: 'cto-2', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: point },
    row: { originalName: 'N-01', region: 'AC', available: 3, capacity: 16, location: point, updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 5, issues: [] }
  } });
  assert.equal(result.status, 'ANALISE_TECNICA');
  assert.equal(fixture({ ctoLocation: null }).status, 'ANALISE_TECNICA');
});

test('ausência de coordenada na planilha não bloqueia quando IXC e FiberDocs confirmam a rota', () => {
  const result = fixture({ sheetLocation: null, rowIssues: ['COORDENADA_PLANILHA_INVALIDA'] });
  assert.equal(result.status, 'VIAVEL');
  assert.ok(result.candidates[0].reasons.includes('COORDENADA_PLANILHA_INVALIDA'));
  assert.equal(result.candidates[0].routeSource, 'CONFIRMED');
});

test('CTO ambígua mantém todas as linhas da planilha e seus identificadores para conferência', () => {
  const result = fixture({ otherCto: {
    cto: { id: 'cto-2', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: point },
    row: { originalName: 'N-01', region: 'AC', available: 3, capacity: 16, location: point, updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 5, issues: [], olt: 'AC', pon: '1602' }
  } });
  const candidate = result.candidates[0];
  assert.equal(candidate.status, 'ANALISE_TECNICA');
  assert.deepEqual(candidate.sheetMatches.map(row => [row.row, row.olt, row.pon, row.available]), [[4, 'AC', '1601', 2], [5, 'AC', '1602', 3]]);
});

test('fontes de regiões distintas não misturam vagas', () => {
  const result = decide({ region: 'AC', location: point },
    { rows: [{ id: 'cto-1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: point }], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    { rows: [{ originalName: 'N-01', region: 'CP', available: 5, capacity: 16, location: point, updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s CP', row: 2, issues: [] }], fetchedAt: now.toISOString(), complete: true, origin: 'DEMO', issues: [] },
    [{ ctoId: 'cto-1', location: point, meters: 20, confirmedAt: now.toISOString(), reference: 'OS' }], policy, now);
  assert.equal(result.status, 'ANALISE_TECNICA');
});

// 1 grau de latitude ≈ 111.195 m; deslocamos só a latitude para controlar a diferença em metros.
const metersToLatitude = (meters) => meters / 111_195;
const shifted = (meters) => ({ latitude: point.latitude + metersToLatitude(meters), longitude: point.longitude });

test('diferença de posição entre IXC e planilha até 25 m não bloqueia a CTO', () => {
  const result = fixture({ sheetLocation: shifted(24) });
  assert.equal(result.status, 'VIAVEL');
  assert.ok(!result.candidates[0].reasons.includes('COORDENADAS_DIVERGENTES'));
});

test('diferença de posição acima de 25 m bloqueia a CTO e exige análise técnica', () => {
  const result = fixture({ sheetLocation: shifted(26) });
  assert.equal(result.status, 'ANALISE_TECNICA');
  assert.ok(result.candidates[0].reasons.includes('COORDENADAS_DIVERGENTES'));
});
