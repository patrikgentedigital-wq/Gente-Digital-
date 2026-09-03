import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { metricsRegistry } from '@/lib/metrics';
import { cacheClient } from '@/lib/cache-client';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { executeDbQuery } from '@/lib/db-client';
import { verifyAuth } from '@/lib/auth-server';

/**
 * Health Check Detalhado (DevOps Regra 4)
 * 
 * Regra 4: Todo serviço deve ter Health Check com status detalhado dos componentes.
 */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = performance.now();

  // 1. Diagnóstico do Banco de Dados
  let dbStatus: 'UP' | 'DOWN' | 'DEGRADED' = 'UP';
  let dbLatencyMs = 0;
  let dbErrorDetails: string | null = null;

  try {
    const dbCheck = await executeDbQuery(
      'health_check_ping',
      async () => {
        const { data, error } = await supabaseAdmin.from('audit_logs').select('id').limit(1);
        return { data, error };
      },
      requestId
    );

    dbLatencyMs = dbCheck.durationMs;
    if (dbCheck.error) {
      dbStatus = 'DEGRADED';
      // Não expor detalhes internos do banco em endpoint público
      dbErrorDetails = 'Detalhes do erro registrados no log do servidor.';
      logger.error('[HEALTH CHECK] Banco de dados degradado', dbCheck.error, undefined, requestId);
    }
  } catch (err: any) {
    dbStatus = 'DOWN';
    dbErrorDetails = 'Detalhes do erro registrados no log do servidor.';
    logger.error('[HEALTH CHECK] Banco de dados indisponível', err, undefined, requestId);
  }

  // 2. Diagnóstico do Cache
  let cacheStatus: 'UP' | 'DOWN' = 'UP';
  let cacheLatencyMs = 0;
  try {
    const cacheStart = performance.now();
    await cacheClient.set('health_check_key', 'ok', 5, requestId);
    const val = await cacheClient.get('health_check_key', requestId);
    cacheLatencyMs = Number((performance.now() - cacheStart).toFixed(2));
    if (val !== 'ok') {
      cacheStatus = 'DOWN';
    }
  } catch (err) {
    cacheStatus = 'DOWN';
  }

  // 3. Métricas de Performance do Processo
  const snapshot = metricsRegistry.getSnapshot();
  const totalDurationMs = Number((performance.now() - startTime).toFixed(2));

  // Registrar requisição HTTP no acumulador
  metricsRegistry.recordHttpRequest(totalDurationMs, dbStatus === 'DOWN' ? 503 : 200);

  const isHealthy = dbStatus !== 'DOWN' && cacheStatus !== 'DOWN';
  const statusCode = isHealthy ? 200 : 503;

  const isAdmin = await verifyAuth(request);

  const healthPayload: Record<string, any> = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    service: 'gente-digital-api',
    requestId,
    durationMs: totalDurationMs,
    components: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        error: dbErrorDetails,
      },
      cache: {
        status: cacheStatus,
        latencyMs: cacheLatencyMs,
        hitRatioPercent: snapshot.cache.hit_ratio_percent,
      },
    },
  };

  // Telemetria detalhada de hardware/processo restrita a administradores autenticados (B5)
  if (isAdmin) {
    healthPayload.system = {
      status: 'UP',
      uptimeSeconds: snapshot.uptime_seconds,
      memoryUsage: snapshot.memory,
      cpuUsage: snapshot.cpu,
    };
  }

  if (!isHealthy) {
    logger.error('[HEALTH CHECK FAIL] Serviço degradado ou indisponível', new Error('Health check failure'), healthPayload, requestId);
  } else {
    logger.info('[HEALTH CHECK OK] Status dos componentes verificado', healthPayload, requestId);
  }

  return NextResponse.json(healthPayload, {
    status: statusCode,
    headers: {
      'x-request-id': requestId,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
