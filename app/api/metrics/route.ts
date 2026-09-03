import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { metricsRegistry } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth-server';

/**
 * Endpoint de Métricas de Performance (DevOps Regra 7)
 *
 * Regra 7: Todo serviço expõe métricas de performance (Tempo, Memória, CPU, DB, Cache).
 * Suporta exportação no formato Prometheus (text/plain) ou JSON.
 * Acesso restrito: sessão de admin ou header `Authorization: Bearer ${METRICS_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  const metricsSecret = process.env.METRICS_SECRET;
  const bearer = request.headers.get('authorization');
  const expectedBearer = metricsSecret ? `Bearer ${metricsSecret}` : '';

  let hasValidBearer = false;
  if (expectedBearer && bearer && bearer.length === expectedBearer.length) {
    try {
      hasValidBearer = timingSafeEqual(Buffer.from(bearer), Buffer.from(expectedBearer));
    } catch {
      hasValidBearer = false;
    }
  }

  if (!hasValidBearer && !(await verifyAuth(request))) {
    logger.warn('[METRICS DENIED] Tentativa de scrape não autorizado', undefined, requestId);
    return NextResponse.json(
      { error: 'Não autorizado' },
      { status: 401, headers: { 'x-request-id': requestId } }
    );
  }

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
