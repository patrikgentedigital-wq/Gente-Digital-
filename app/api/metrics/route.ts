import { NextRequest, NextResponse } from 'next/server';
import { metricsRegistry } from '@/lib/metrics';
import { logger } from '@/lib/logger';

/**
 * Endpoint de Métricas de Performance (DevOps Regra 7)
 * 
 * Regra 7: Todo serviço expõe métricas de performance (Tempo, Memória, CPU, DB, Cache).
 * Suporta exportação no formato Prometheus (text/plain) ou JSON.
 */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const format = request.nextUrl.searchParams.get('format');

  logger.info('[METRICS SCRAPE] Métricas coletadas', { format: format || 'prometheus' }, requestId);

  if (format === 'json') {
    return NextResponse.json(metricsRegistry.getSnapshot(), {
      status: 200,
      headers: {
        'x-request-id': requestId,
        'Cache-Control': 'no-store, no-cache',
      },
    });
  }

  const prometheusText = metricsRegistry.toPrometheusFormat();

  return new NextResponse(prometheusText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'x-request-id': requestId,
      'Cache-Control': 'no-store, no-cache',
    },
  });
}
