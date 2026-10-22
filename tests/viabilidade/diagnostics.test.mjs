import test from 'node:test';
import assert from 'node:assert/strict';
import { buildViabilityDiagnostics } from '../../.test-build/viabilidade/diagnostics.js';

const checkedAt = '2026-10-06T18:00:00.000Z';
const point = { latitude: -1.02, longitude: -46.63 };
const snapshot = rows => ({ rows, fetchedAt: checkedAt, complete: true, origin: 'LIVE', issues: [] });
const sheetRow = (row, changes = {}) => ({
  originalName: 'N-01', region: 'AC', available: 2, capacity: 8, location: null,
  updatedOn: '2026-10-06', observations: [], sheet: 'CTO,s AC', row,
  issues: ['COORDENADA_PLANILHA_INVALIDA'], olt: 'AC', pon: String(1600 + row), ...changes
});

test('diagnóstico calcula a situação atual de IXC, planilha, ambiguidades e cabos sem coordenadas', () => {
  const diagnostics = buildViabilityDiagnostics({
    AC: {
      ixc: snapshot([{ id: '541', originalName: 'N-01-1X8', region: 'AC', active: true, capacity: 8, location: point }]),
      sheets: snapshot([sheetRow(4), sheetRow(5, { available: null, capacity: null, pon: '1602' })]),
      network: { poles: [], cables: [{ id: '20', name: 'Trecho 1', points: [point, { latitude: -1.021, longitude: -46.63 }] }], cableCount: 2, complete: false, issues: ['CABO_GEOMETRIA_PENDENTE'], fetchedAt: checkedAt,
        diagnostics: { missingCables: [{ id: '21', name: 'Trecho 2' }] } }
    },
    CP: {
      ixc: snapshot([]), sheets: { ...snapshot([]), complete: false, issues: ['PLANILHA_READ_FAILED'] },
      network: null
    }
  }, new Date(checkedAt));

  assert.equal(diagnostics.checkedAt, checkedAt);
  assert.equal(diagnostics.regions.AC.sheet.rows, 2);
  assert.equal(diagnostics.regions.AC.sheet.ambiguousCodes, 1);
  assert.equal(diagnostics.regions.AC.sheet.rowsInAmbiguousCodes, 2);
  assert.equal(diagnostics.regions.AC.sheet.missingCoordinates, 2);
  assert.equal(diagnostics.regions.AC.sheet.missingVacancies, 1);
  assert.deepEqual(diagnostics.regions.AC.sheet.ambiguousExamples[0], {
    code: 'N-1',
    rows: [
      { originalName: 'N-01', sheet: 'CTO,s AC', row: 4, olt: 'AC', pon: '1604', available: 2, capacity: 8, updatedOn: '2026-10-06' },
      { originalName: 'N-01', sheet: 'CTO,s AC', row: 5, olt: 'AC', pon: '1602', available: null, capacity: null, updatedOn: '2026-10-06' }
    ]
  });
  assert.equal(diagnostics.regions.AC.matching.ambiguous, 1);
  assert.equal(diagnostics.regions.AC.fiberDocs.missingCableCount, 1);
  assert.deepEqual(diagnostics.regions.AC.fiberDocs.missingCables, [{ id: '21', name: 'Trecho 2' }]);
  assert.equal(diagnostics.regions.CP.sources.sheets.complete, false);
  assert.equal(diagnostics.regions.CP.fiberDocs.complete, false);
});
