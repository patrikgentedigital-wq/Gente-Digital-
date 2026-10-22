import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalKey, parseSheetRows, validateSheetHeaders } from '../../.test-build/viabilidade/domain/normalize.js';
import { distanceMeters } from '../../.test-build/viabilidade/domain/distance.js';
import { matchCto } from '../../.test-build/viabilidade/domain/match.js';

test('normaliza o prefixo do IXC com região, sem fundir regiões', () => {
  assert.equal(canonicalKey('AC', ' AC-CTO N01 '), 'AC:1');
  assert.equal(canonicalKey('CP', 'N-01'), 'CP:1');
});

test('troca de colunas da planilha bloqueia parsing mesmo mantendo os nomes dos cabecalhos', () => {
  for (const [region,headerIndex,vacancyIndex,dateIndex] of [['CP',0,3,9],['AC',2,2,10]]) {
    const names = region === 'CP' ? ['GENTE','SPLITT','','VAGAS','PON','','','','','DATA']
      : ['Nº CTO','SPLITT','VAGAS','OLT','VLAN/PON','','','','','','ATUALIZADO'];
    const values = Array.from({length:headerIndex+1},()=>[]);
    values[headerIndex] = [...names];
    assert.deepEqual(validateSheetHeaders(region,values),[]);
    [values[headerIndex][vacancyIndex],values[headerIndex][dateIndex]] =
      [values[headerIndex][dateIndex],values[headerIndex][vacancyIndex]];
    assert.deepEqual(validateSheetHeaders(region,values),['ESQUEMA_PLANILHA_ALTERADO']);
    values.push(['N-01','1X16','2','7']);
    assert.deepEqual(parseSheetRows(region,values),[]);
  }
});

test('recusa datas impossíveis e interpreta datas brasileiras', () => {
  const rows = parseSheetRows('AC', [
    ['', '', ''],
    ['', '', ''],
    ['Nº CTO', 'SPLITT.', 'VAGAS', 'OLT', ' VLAN/PON', 'LUZ', 'LOC / INMAP', 'BAIRRO/RUA', 'TÉC.', 'COM CÓD.', 'ATUALIZADO'],
    ['N-01', '1X16', '2', 'AC', '1601', '-20.1', '-1.02, -46.63', 'Rua A', '', '', '31/02/2026'],
    ['N-02', '1X16', '3', 'AC', '1601', '-20.1', '-1.02, -46.63', 'Rua B', '', '', '03/09/2026']
  ]);
  assert.equal(rows[0].updatedOn, null);
  assert.ok(rows[0].issues.includes('DATA_ATUALIZACAO_INVALIDA'));
  assert.equal(rows[1].updatedOn, '2026-09-03');
});

test('preserva vaga vazia como ausente e CTOs distintas com coordenadas iguais', () => {
  const rows = parseSheetRows('CP', [
    ['gente', 'SPLITT', 'FIBRA >', 'VAGAS', 'PON', 'LUZ', 'LOCALIZAÇÃO', 'BAIRRO', 'TEC', 'DATA', 'IDENTIF', 'ALTERADO', 'OBS1', 'OBS2', 'OBS3', 'FIBERDOC'],
    ['N-02', '1X16', '', '', '1009', '-18.1', '-1.18, -47.18', 'Rua A', '', '2026-09-03', '', '', '', '', '', ''],
    ['N-03', '1X16', '', '7', '1009', '-18.1', '-1.18, -47.18', 'Rua A', '', '2026-09-03', '', '', '', '', '', '']
  ]);
  assert.equal(rows[0].available, null);
  assert.equal(rows[0].location.latitude, rows[1].location.latitude);
  assert.notEqual(rows[0].originalName, rows[1].originalName);
});

test('classifica notas técnicas sem armazenar texto livre ou metadados de usuário', () => {
  const cp = parseSheetRows('CP', [
    ['gente', 'SPLITT', 'FIBRA >', 'VAGAS', 'PON', 'LUZ', 'LOCALIZAÇÃO', 'BAIRRO', 'TEC', 'DATA', 'IDENTIF', 'ALTERADO', 'OBS1', 'OBS2', 'OBS3', 'FIBERDOC'],
    ['N-01', '1X16', '', '4', '1015', '-22.7', '-1.17, -47.18', 'Rua A', '', '28/05/2025', 'TODOS', 'FUNCIONARIO_PRIVADO', '1 vaga sem acoplador', '', '', 'FIBERDOC_PRIVADO']
  ])[0];
  assert.deepEqual(cp.observations, ['RESTRICAO_SEM_ACOPLADOR']);
  assert.equal(JSON.stringify(cp).includes('acoplador'), false);
  assert.equal(JSON.stringify(cp).includes('FUNCIONARIO_PRIVADO'), false);
  assert.equal(JSON.stringify(cp).includes('FIBERDOC_PRIVADO'), false);

  const ac = parseSheetRows('AC', [
    [], [],
    ['Nº CTO', 'SPLITT.', 'VAGAS', 'OLT', 'VLAN/PON', 'LUZ', 'LOC / INMAP', 'BAIRRO/RUA', 'TÉC.', 'COM CÓD.', 'ATUALIZADO', 'ALTERADO', 'COR DA FIBRA', 'LOG / CÓD.'],
    ['N-04', '1X16', '3', 'AC', '1601', '-21.09', '-1.02, -46.63', 'Rua B', '', 'APENAS 8', '09/02/2026', 'FUNCIONARIO_PRIVADO', 'FIBRA VIOLETA', '1 porta com loss']
  ])[0];
  assert.deepEqual(ac.observations, ['RESTRICAO_FIBRA_OU_SINAL']);
  assert.equal(ac.olt, 'AC');
  assert.equal(ac.pon, '1601');
  assert.equal(JSON.stringify(ac).includes('porta com loss'), false);
  assert.equal(JSON.stringify(ac).includes('FIBRA VIOLETA'), false);
});

test('distância é métrica e simétrica', () => {
  const a = { latitude: -1.02367, longitude: -46.63678 };
  const b = { latitude: -1.02363, longitude: -46.63767 };
  assert.ok(distanceMeters(a, b) > 0);
  assert.equal(distanceMeters(a, b), distanceMeters(b, a));
});

test('CTO duplicada na mesma região não se associa por ordem da planilha', () => {
  const cto = { id: '1', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location: null };
  const rows = ['A', 'B'].map((suffix) => ({
    originalName: 'N-01', region: 'AC', available: 2, capacity: 16, location: null,
    updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 4,
    issues: [], suffix
  }));
  const match = matchCto(cto, rows);
  assert.equal(match.row, null);
  assert.ok(match.reasons.includes('CTO_AMBIGUA'));
});
