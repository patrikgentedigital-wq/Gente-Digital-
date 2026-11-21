import { NextRequest, NextResponse } from 'next/server';

import { loadCancellationMetrics, loadCommercialMetrics, parseCommercialPeriod } from '@/lib/analytics/commercial-ixc';
import { readCommercialIxcPage } from '@/lib/analytics/commercial-ixc-read';
import { verifyAuth } from '@/lib/auth-server';
import { getIxcCredentials } from '@/lib/ixc';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  let authorized;
  try {
    authorized = await verifyAuth(request);
  } catch {
    return NextResponse.json({ error: 'Autenticação indisponível.' }, { status: 503, headers });
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403, headers });
  }

  let period;
  try {
    period = parseCommercialPeriod(request.nextUrl.searchParams);
  } catch {
    return NextResponse.json({ error: 'Informe um período válido de até 92 dias.' }, { status: 400, headers });
  }

  try {
    const ixc = await getIxcCredentials();
    if (!ixc.hasCredentials) throw new Error('IXC não configurado.');

    const deadline = Date.now() + 18_000;
    const load = request.nextUrl.searchParams.get('section') === 'cancelamentos'
      ? loadCancellationMetrics
      : loadCommercialMetrics;
    const baseUrl = 'https://' + ixc.cleanDomain + '/webservice/v1/';
    const metrics = await load(period, (table, body) =>
      readCommercialIxcPage(baseUrl + table, ixc.authHeader, body, deadline));

    if (Object.values(metrics).every((records) => records === null)) throw new Error('IXC indisponível.');
    return NextResponse.json({ metrics, readAt: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar os indicadores do IXC.' }, {
      status: 503, headers,
    });
  }
}
