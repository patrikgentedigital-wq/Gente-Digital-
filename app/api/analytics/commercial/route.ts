import { NextRequest, NextResponse } from 'next/server';

import { loadCommercialMetrics, parseCommercialPeriod } from '@/lib/analytics/commercial-ixc';
import { verifyAuth } from '@/lib/auth-server';
import { fetchIxcWithTimeout, getIxcCredentials } from '@/lib/ixc';

export const dynamic = 'force-dynamic';

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

    const deadline = Date.now() + 10_000;
    const metrics = await loadCommercialMetrics(period, async (table, body) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Tempo de consulta excedido.');
      const response = await fetchIxcWithTimeout('https://' + ixc.cleanDomain + '/webservice/v1/' + table, {
        method: 'POST',
        headers: { Authorization: ixc.authHeader, 'Content-Type': 'application/json', ixcsoft: 'listar' },
        body: JSON.stringify(body),
        cache: 'no-store',
        redirect: 'error',
      }, remaining);
      if (!response.ok) throw new Error('Falha na consulta ao IXC.');
      return response.json();
    });

    if (Object.values(metrics).every((records) => records === null)) throw new Error('IXC indisponível.');
    return NextResponse.json({ metrics, readAt: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar os indicadores do IXC.' }, {
      status: 503, headers,
    });
  }
}
