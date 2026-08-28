/**
 * Wrapper de Acesso ao Banco de Dados com Medição de Tempo e Logging (DevOps Regra 5)
 * 
 * Regra 5: Todo acesso ao banco possui Carry Logging com tempo em milissegundos.
 */

import { logger } from './logger';
import { metricsRegistry } from './metrics';

export interface DbQueryResult<T> {
  data: T | null;
  error: any | null;
  durationMs: number;
}

/**
 * Encapsula a execução de consultas de banco de dados, medindo rigorosamente
 * o tempo de execução e emitindo logs em JSON estruturado com Request ID.
 */
export async function executeDbQuery<T>(
  queryName: string,
  queryFn: () => Promise<{ data: T | null; error: any }>,
  requestId?: string
): Promise<DbQueryResult<T>> {
  const startTime = performance.now();
  let result: { data: T | null; error: any } = { data: null, error: null };
  let executionError: unknown = null;
  let durationMs = 0;

  try {
    result = await queryFn();
    if (result.error) {
      executionError = result.error;
    }
  } catch (err) {
    executionError = err;
    result.error = err;
  } finally {
    durationMs = Number((performance.now() - startTime).toFixed(2));
    const isSlowQuery = durationMs > 200;

    // Registrar no coletor de métricas do serviço (Regra 7)
    metricsRegistry.recordDbQuery(durationMs, isSlowQuery);

    const logMeta = {
      event: 'DB_QUERY',
      queryName,
      durationMs,
      slowQuery: isSlowQuery,
      success: !executionError,
    };

    if (executionError) {
      logger.error(
        `[DB ERROR] Falha na consulta '${queryName}' após ${durationMs}ms`,
        executionError,
        logMeta,
        requestId
      );
    } else if (isSlowQuery) {
      logger.warn(
        `[DB SLOW QUERY] Consulta '${queryName}' levou ${durationMs}ms (>200ms)`,
        logMeta,
        requestId
      );
    } else {
      logger.info(
        `[DB QUERY] Consulta '${queryName}' executada em ${durationMs}ms`,
        logMeta,
        requestId
      );
    }
  }

  return {
    data: result.data,
    error: result.error,
    durationMs,
  };
}
