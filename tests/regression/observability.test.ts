/**
 * Testes de Regressão Automatizados para Fluxos Críticos e Observabilidade (DevOps Regra 8)
 * 
 * Regra 8: Todo fluxo crítico deve ter testes de regressão.
 * Este arquivo valida:
 * 1. Formato estrito dos logs JSON e presença do Stack Trace em erros.
 * 2. Injeção e propagação do Request ID.
 * 3. Rastreamento de Hit/Miss no Cache.
 * 4. Funcionamento do wrapper de Banco de Dados com medição de tempo.
 * 5. Registro e exportação correta de Métricas de Performance.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { logger, StructuredLogPayload } from '../../lib/logger';
import { metricsRegistry } from '../../lib/metrics';
import { cacheClient } from '../../lib/cache-client';
import { executeDbQuery } from '../../lib/db-client';

describe('Suite de Regressão: Observabilidade e DevOps Rules', () => {

  test('Regra 2 & 3: Deve emitir log JSON válido com Stack Trace completo em caso de erro', () => {
    const testError = new Error('Falha simulada de banco de dados');
    const requestId = 'req-test-12345';

    const payload: StructuredLogPayload = logger.error(
      'Erro crítico de teste',
      testError,
      { customField: 'test_value' },
      requestId
    );

    assert.equal(payload.level, 'ERROR');
    assert.equal(payload.requestId, requestId);
    assert.ok(payload.timestamp, 'Deve possuir timestamp ISO');
    assert.ok(payload.error, 'Objeto error deve estar presente');
    assert.equal(payload.error.name, 'Error');
    assert.equal(payload.error.message, 'Falha simulada de banco de dados');
    assert.ok(payload.error.stack.includes('Falha simulada de banco de dados'), 'Deve conter stack trace em texto');
  });

  test('Regra 5: Deve medir o tempo de execução e logar acessos ao banco de dados', async () => {
    const requestId = 'req-db-67890';

    const result = await executeDbQuery(
      'test_query_regression',
      async () => {
        // Simular latência de banco de 50ms
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { data: [{ id: 1, name: 'Gente Digital' }], error: null };
      },
      requestId
    );

    assert.ok(result.durationMs >= 40, 'Deve ter medido o tempo de execução (>40ms)');
    assert.ok(result.data !== null, 'Retorno do banco deve ser preservado');
    assert.equal(result.data[0].name, 'Gente Digital');
  });

  test('Regra 6: Deve rastrear Hit e Miss no Cache com contadores corretos', async () => {
    const requestId = 'req-cache-11111';
    const cacheKey = `test_key_${Date.now()}`;

    // 1. Deve dar Miss na primeira consulta
    const missResult = await cacheClient.get(cacheKey, requestId);
    assert.equal(missResult, null, 'Chave não deve existir inicialmente (Miss)');

    // 2. Salvar no cache
    await cacheClient.set(cacheKey, { user: 'DevOps' }, 10, requestId);

    // 3. Deve dar Hit na segunda consulta
    const hitResult = await cacheClient.get<{ user: string }>(cacheKey, requestId);
    assert.notEqual(hitResult, null, 'Chave deve existir no cache (Hit)');
    assert.equal(hitResult?.user, 'DevOps');

    // 4. Checar estatísticas do coletor
    const stats = cacheClient.getStats();
    assert.ok(stats.hits_total >= 1, 'Contador de hits deve ter sido incrementado');
    assert.ok(stats.misses_total >= 1, 'Contador de misses deve ter sido incrementado');
  });

  test('Regra 7: Deve coletar métricas de CPU, Memória, Requisições e Banco', () => {
    const snapshot = metricsRegistry.getSnapshot();

    assert.ok(snapshot.memory.rss_bytes > 0, 'Memory RSS deve ser maior que zero');
    assert.ok(snapshot.memory.heap_used_bytes > 0, 'Heap Used deve ser maior que zero');
    assert.ok(typeof snapshot.cpu.user_microseconds === 'number', 'CPU user micros deve ser numérico');
    assert.ok(typeof snapshot.uptime_seconds === 'number', 'Uptime deve ser numérico');

    const prometheusFormat = metricsRegistry.toPrometheusFormat();
    assert.ok(prometheusFormat.includes('process_resident_memory_bytes'), 'Prometheus format deve conter métricas de memória');
    assert.ok(prometheusFormat.includes('cache_hits_total'), 'Prometheus format deve conter métricas de cache');
  });

});
