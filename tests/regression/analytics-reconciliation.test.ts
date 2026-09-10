import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareMetric } from '../../lib/analytics/reconciliation';

test('compareMetric marca match quando os valores são iguais', () => {
  assert.deepEqual(compareMetric('atendimento.total', 5040, 5040), {
    metricId: 'atendimento.total',
    expected: 5040,
    actual: 5040,
    difference: 0,
    status: 'match',
    reason: null,
  });
});

test('compareMetric marca mismatch sem tolerância implícita', () => {
  const result = compareMetric(
    'atendimento.total',
    5040,
    5039,
    'snapshot atualizado em horários diferentes',
  );

  assert.equal(result.status, 'mismatch');
  assert.equal(result.difference, -1);
  assert.equal(result.reason, 'snapshot atualizado em horários diferentes');
});

test('compareMetric exige valor comparável antes de declarar paridade', () => {
  const result = compareMetric('cancelamentos.total', null, 3);

  assert.equal(result.status, 'not_comparable');
  assert.equal(result.difference, 'valor ausente');
  assert.equal(result.reason, 'expected ou actual não disponível');
});

test('compareMetric compara textos sem coerção numérica', () => {
  const result = compareMetric('atendimento.status', 'finalizado', 'FINALIZADO');

  assert.equal(result.status, 'mismatch');
  assert.equal(result.difference, 'finalizado != FINALIZADO');
  assert.equal(result.reason, null);
});

test('compareMetric não trata ausência como zero', () => {
  const result = compareMetric('geral.vendas', null, 0);

  assert.equal(result.status, 'not_comparable');
  assert.notEqual(result.status, 'match');
});
