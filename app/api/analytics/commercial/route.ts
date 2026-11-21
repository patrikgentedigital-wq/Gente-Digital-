import { NextRequest, NextResponse } from 'next/server';

import { loadCancellationMetrics, loadCommercialMetrics, parseCommercialPeriod } from '@/lib/analytics/commercial-ixc';
import { readCommercialIxcPage } from '@/lib/analytics/commercial-ixc-read';
import { verifyAuth } from '@/lib/auth-server';
import { getIxcCredentials } from '@/lib/ixc';

export const dynamic = 'force-dynamic';
export const maxDuration = 50;

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

    const isCancellation = request.nextUrl.searchParams.get('section') === 'cancelamentos';
    const startedAt = Date.now();
    const recordsDeadline = startedAt + (isCancellation ? 18_000 : 25_000);
    const catalogsDeadline = startedAt + 40_000;
    const load = isCancellation ? loadCancellationMetrics : loadCommercialMetrics;
    const baseUrl = 'https://' + ixc.cleanDomain + '/webservice/v1/';
    const metrics = await load(period, async (table, body) => {
      try {
        // Vendas loads name catalogs after the period records. Give them time even after retries.
        const deadline = !isCancellation && body.qtype === table + '.id' ? catalogsDeadline : recordsDeadline;
        return await readCommercialIxcPage(baseUrl + table, ixc.authHeader, body, deadline, fetch, isCancellation ? 2 : 3);
      } catch (error) {
        console.warn('Leitura comercial do IXC falhou', { table, page: body.page, errorType: error instanceof Error ? error.name : 'Unknown' });
        throw error;
      }
    });

    if (Object.values(metrics).every((records) => records === null)) throw new Error('IXC indisponível.');
    return NextResponse.json({ metrics, readAt: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar os indicadores do IXC.' }, {
      status: 503, headers,
    });
  }
}
