import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { metricsRegistry } from '@/lib/metrics';
import { cacheClient } from '@/lib/cache-client';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = performance.now();
  let dbStatus: 'UP' | 'DOWN' = 'UP';
  let dbLatencyMs = 0;
  let dbError: string | null = null;

  if (!isSupabaseAdminConfigured()) {
    dbStatus = 'DOWN';
    dbError = 'Supabase não configurado';
  } else {
    try {
      const dbStart = performance.now();
      const { error } = await supabaseAdmin.from('audit_logs').select('id').limit(1);
      dbLatencyMs = Number((performance.now() - dbStart).toFixed(2));
      if (error) {
        dbStatus = 'DOWN';
        dbError = error.message;
      }
    } catch (error) {
      dbStatus = 'DOWN';
      dbError = error instanceof Error ? error.message : 'falha desconhecida';
    }
  }

  let cacheStatus: 'UP' | 'DOWN' = 'UP';
  let cacheLatencyMs = 0;
  try {
    const cacheStart = performance.now();
    await cacheClient.set('health_check_key', 'ok', 5, requestId);
    const value = await cacheClient.get('health_check_key', requestId);
    cacheLatencyMs = Number((performance.now() - cacheStart).toFixed(2));
    if (value !== 'ok') cacheStatus = 'DOWN';
  } catch (error) {
    cacheStatus = 'DOWN';
    logger.warn('[HEALTH CHECK] Cache indisponível', { error: error instanceof Error ? error.message : 'falha desconhecida' }, requestId);
  }

  const snapshot = metricsRegistry.getSnapshot();
  const totalDurationMs = Number((performance.now() - startTime).toFixed(2));
  const isHealthy = dbStatus === 'UP' && cacheStatus === 'UP';
  const statusCode = isHealthy ? 200 : 503;

  const internalDetails = {
    requestId,
    dbStatus,
    dbError,
    cacheStatus,
    totalDurationMs,
  };
  if (isHealthy) logger.info('[HEALTH CHECK OK]', internalDetails, requestId);
  else logger.error('[HEALTH CHECK FAIL]', new Error('health_check_failure'), internalDetails, requestId);

  metricsRegistry.recordHttpRequest(totalDurationMs, statusCode);

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    service: 'gente-digital-api',
    requestId,
    durationMs: totalDurationMs,
    components: {
      database: { status: dbStatus, latencyMs: dbLatencyMs },
      cache: { status: cacheStatus, latencyMs: cacheLatencyMs },
      system: { status: 'UP', uptimeSeconds: snapshot.uptime_seconds },
    },
  }, {
    status: statusCode,
    headers: {
      'x-request-id': requestId,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
