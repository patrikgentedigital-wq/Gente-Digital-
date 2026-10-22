import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTechnicalActivityText } from '../../.test-build/viabilidade/activity.js';

test('ficha pronta resume endereço, CTO, rota real, fonte das vagas e próxima ação sem expor coordenadas', () => {
  const decision = {
    status: 'VIAVEL', recommendedCtoId: '541', reasons: [],
    sources: { ixcFetchedAt: '2026-10-06T17:59:00.000Z', sheetsFetchedAt: '2026-10-06T17:59:00.000Z' },
    candidates: [{ ctoId: '541', status: 'VIAVEL', geographicMeters: 78, routeMeters: 157, routeSource: 'FIBERDOCS_ESTIMATE',
      available: 1, ixcCapacity: 8, sheetCapacity: 8, updatedOn: '2026-10-06', sheetCtoName: 'N220-1X8', sheet: 'CTO,s AC', row: 221,
      sheetMatches: [{ originalName: 'N220-1X8', sheet: 'CTO,s AC', row: 221, olt: 'AC', pon: '1601', available: 1, capacity: 8, updatedOn: '2026-10-06' }],
      reasons: ['TRAJETO_ESTIMADO_FIBERDOCS'] }]
  };
  const text = buildTechnicalActivityText(decision, { address: 'Rua das Palmeiras, 25, Bragança-PA', leadId: 5 });
  assert.match(text, /Lead #5/);
  assert.match(text, /Rua das Palmeiras, 25/);
  assert.match(text, /IXC #541/);
  assert.match(text, /CTO,s AC · linha 221/);
  assert.match(text, /VLAN\/PON 1601/);
  assert.match(text, /Rota FiberDocs: 157 m/);
  assert.match(text, /1 vaga/);
  assert.match(text, /Prosseguir com a instalação/);
  assert.doesNotMatch(text, /-1\.02|-46\.63/);
});

test('ficha de análise técnica não transforma CTO candidata em recomendação', () => {
  const decision = { status: 'ANALISE_TECNICA', recommendedCtoId: null, reasons: [], sources: { ixcFetchedAt: '', sheetsFetchedAt: '' },
    candidates: [{ ctoId: '541', status: 'ANALISE_TECNICA', geographicMeters: 80, routeMeters: null, routeSource: null, available: null,
      ixcCapacity: 8, sheetCapacity: 8, updatedOn: null, sheetCtoName: null, sheet: null, row: null, sheetMatches: [
        { originalName: 'N-01', sheet: 'CTO,s AC', row: 4, olt: 'AC', pon: '1601', available: 2, capacity: 8, updatedOn: null },
        { originalName: 'N-01', sheet: 'CTO,s AC', row: 5, olt: 'AC', pon: '1602', available: 3, capacity: 8, updatedOn: null }
      ], reasons: ['CTO_AMBIGUA', 'TRAJETO_NAO_CONFIRMADO'] }] };
  const text = buildTechnicalActivityText(decision, { address: '', leadId: null });
  assert.match(text, /candidata para conferência/);
  assert.match(text, /linha 4.*VLAN\/PON 1601/);
  assert.match(text, /linha 5.*VLAN\/PON 1602/);
  assert.match(text, /Resolver as pendências antes de agendar/);
  assert.doesNotMatch(text, /CTO indicada/);
});

test('ficha marca coordenada ausente da planilha como observação quando IXC e FiberDocs fecharam a rota', () => {
  const decision = {
    status: 'VIAVEL', recommendedCtoId: '541', reasons: [], sources: { ixcFetchedAt: '', sheetsFetchedAt: '' },
    candidates: [{ ctoId: '541', status: 'VIAVEL', geographicMeters: 80, routeMeters: 157, routeSource: 'FIBERDOCS_ESTIMATE',
      available: 2, ixcCapacity: 8, sheetCapacity: 8, updatedOn: '2026-10-06', sheetCtoName: 'N-01', sheet: 'CTO,s AC', row: 4,
      sheetMatches: [{ originalName: 'N-01', sheet: 'CTO,s AC', row: 4, olt: 'AC', pon: '1601', available: 2, capacity: 8, updatedOn: '2026-10-06' }],
      reasons: ['COORDENADA_PLANILHA_INVALIDA', 'TRAJETO_ESTIMADO_FIBERDOCS'] }]
  };
  const text = buildTechnicalActivityText(decision, { address: '', leadId: null });
  assert.match(text, /Observações:[\s\S]*planilha não informa coordenada/);
  assert.doesNotMatch(text, /Pendências:[\s\S]*planilha não informa coordenada/);
});

test('ficha permanece renderizável quando uma resposta antiga não contém metadados das fontes', () => {
  const decision = { status: 'ANALISE_TECNICA', recommendedCtoId: null, candidates: [], reasons: [] };
  const text = buildTechnicalActivityText(decision, { address: '', leadId: null });
  assert.match(text, /IXC consultado: não registrada/);
  assert.match(text, /Planilha consultada: não registrada/);
});

test('ficha OSM discrimina acessos e 20 m de reserva sem sugerir instalação aprovada', () => {
  const decision = {
    status: 'ANALISE_TECNICA', recommendedCtoId: null, reasons: ['CANDIDATA_COM_DADOS_INSUFICIENTES'],
    sources: { ixcFetchedAt: '', sheetsFetchedAt: '', roadGraphVersion: '0123456789abcdefabcd', roadGraphUpdatedAt: '2026-10-07T14:30:29Z' },
    candidates: [{ ctoId: '541', status: 'ANALISE_TECNICA', geographicMeters: 80, routeMeters: 177.2,
      routeSource: 'OSM_ESTIMATE', routeComponents: { lineMeters: 150, installAccessMeters: 3, ctoAccessMeters: 4.2, reserveMeters: 20, totalMeters: 177.2 },
      available: 2, ixcCapacity: 8, sheetCapacity: 8, updatedOn: null, sheetCtoName: null, sheet: null, row: null,
      sheetMatches: [], reasons: ['TRAJETO_ESTIMADO_OSM'] }],
  };
  const text = buildTechnicalActivityText(decision, { address: 'Rua de teste', leadId: null });
  assert.match(text, /Rota estimada pelas ruas \(OSM\): 177 m/);
  assert.match(text, /Acesso do imóvel até a rede: 3 m/);
  assert.match(text, /Acesso da CTO até a rede: 4 m/);
  assert.match(text, /Reserva de fibra: 20 m/);
  assert.match(text, /Grafo de ruas OSM: 0123456789abcdefabcd/);
  assert.match(text, /permanece em análise técnica/);
  assert.doesNotMatch(text, /Próxima ação: Prosseguir/);
});
