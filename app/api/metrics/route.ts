import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { metricsRegistry } from '@/lib/metrics';
import { logger } from '@/lib/logger';

function hasValidMetricsToken(request: NextRequest) {
  const expected = process.env.METRICS_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const received = request.headers.get('x-metrics-token') || '';
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  if (!hasValidMetricsToken(request)) {
    if (!process.env.METRICS_SECRET && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Métricas não configuradas.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get('format');
  logger.info('[METRICS SCRAPE]', { format: format || 'prometheus' }, requestId);

  if (format === 'json') {
    return NextResponse.json(metricsRegistry.getSnapshot(), {
      status: 200,
      headers: {
        'x-request-id': requestId,
        'Cache-Control': 'no-store, no-cache',
      },
    });
  }

  return new NextResponse(metricsRegistry.toPrometheusFormat(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'x-request-id': requestId,
      'Cache-Control': 'no-store, no-cache',
    },
  });
}
