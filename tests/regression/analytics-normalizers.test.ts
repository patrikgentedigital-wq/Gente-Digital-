import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIdentifier, normalizeSourceTimestamp, preserveRawIdentifier } from '../../lib/analytics/normalizers';

test('preserveRawIdentifier mantém zeros à esquerda e não converte para number', () => {
  const identifier = preserveRawIdentifier('000123');
  assert.equal(identifier.rawValue, '000123');
  assert.equal(typeof identifier.rawValue, 'string');
  assert.equal(identifier.kind, 'unknown');
});

test('preserveRawIdentifier preserva uma string inteira além do limite seguro byte a byte', () => {
  const rawValue = '9007199254740993';
  const identifier = preserveRawIdentifier(rawValue);

  assert.equal(identifier.rawValue, rawValue);
  assert.equal(typeof identifier.rawValue, 'string');
});

test('preserveRawIdentifier rejeita inteiro não seguro em vez de serializar valor corrompido', () => {
  const unsafeNumber = Number('9007199254740993');
  assert.equal(Number.isSafeInteger(unsafeNumber), false);
  assert.throws(() => preserveRawIdentifier(unsafeNumber), RangeError);
});

test('preserveRawIdentifier normaliza somente espaços externos e nulos', () => {
  assert.deepEqual(preserveRawIdentifier(null), { rawValue: null, kind: 'unknown' });
  assert.deepEqual(preserveRawIdentifier('   '), { rawValue: null, kind: 'unknown' });
  assert.equal(preserveRawIdentifier(123).rawValue, '123');
  assert.equal(preserveRawIdentifier('  000123  ').rawValue, '000123');
});

test('classifyIdentifier respeita dica explícita da origem', () => {
  assert.equal(classifyIdentifier('123', 'id_cliente'), 'client_id');
  assert.equal(classifyIdentifier('123', 'protocolo'), 'protocol');
  assert.equal(classifyIdentifier('123', 'id_contrato'), 'contract_id');
  assert.equal(classifyIdentifier('123', 'telefone'), 'phone');
});

test('classifyIdentifier não infere tipo de valor ambíguo', () => {
  assert.equal(classifyIdentifier('000123'), 'unknown');
  assert.equal(classifyIdentifier('11999999999'), 'unknown');
  assert.equal(classifyIdentifier('123', 'identificador'), 'unknown');
  assert.equal(classifyIdentifier(null, 'id_cliente'), 'unknown');
});

test('normalizeSourceTimestamp retorna ISO ou null', () => {
  assert.equal(normalizeSourceTimestamp('2026-09-01T10:00:00-03:00'), '2026-09-01T13:00:00.000Z');
  assert.equal(normalizeSourceTimestamp('2026-09-01T10:00:00+02:00'), '2026-09-01T08:00:00.000Z');
  assert.equal(normalizeSourceTimestamp('01/09/2026 10:00:00'), '2026-09-01T13:00:00.000Z');
  assert.equal(normalizeSourceTimestamp('2026-09-01T10:00:00'), '2026-09-01T13:00:00.000Z');
  assert.equal(normalizeSourceTimestamp('valor-invalido'), null);
  assert.equal(normalizeSourceTimestamp(null), null);
  assert.equal(normalizeSourceTimestamp(new Date('2026-09-01T13:00:00Z')), '2026-09-01T13:00:00.000Z');
});

test('normalizeSourceTimestamp usa o timezone explícito do domínio sob TZ=UTC', () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'UTC';

  try {
    assert.equal(normalizeSourceTimestamp('01/09/2026 10:00:00'), '2026-09-01T13:00:00.000Z');
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test('normalizeSourceTimestamp rejeita datas brasileiras impossíveis e sufixos', () => {
  for (const value of [
    '31/02/2026 10:00:00',
    '31/02/2026',
    '32/01/2026',
    '13/13/2026',
    '01/09/2026 24:00:00',
    '01/09/2026 10:00:00 lixo',
    '01/09/2026T10:00:00.000',
  ]) {
    assert.equal(normalizeSourceTimestamp(value), null, value);
  }
});

test('normalizeSourceTimestamp rejeita date-only e formatos ambíguos', () => {
  for (const value of [
    '2026-09-01',
    '01/09/2026',
    '2026/09/01 10:00:00',
    '09-01-2026 10:00:00',
    '2026-9-1T10:00:00Z',
  ]) {
    assert.equal(normalizeSourceTimestamp(value), null, value);
  }
});
