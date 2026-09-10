import { NextRequest, NextResponse } from 'next/server';
import {
  parseAnalyticsWindow,
  queryAnalyticsOverview,
  type AnalyticsOverviewQueryResult,
} from './query';
import {
  serializeAnalyticsOverview,
  type AnalyticsOverviewResponse,
} from './response';
import type { MetricWindow } from './metrics';

type Authenticate = (request: Request) => Promise<unknown | null>;
type Query = (window: MetricWindow) => Promise<AnalyticsOverviewQueryResult>;

export interface AnalyticsOverviewHandlerDependencies {
  authenticate?: Authenticate;
  query?: Query;
}

function jsonError(error: string, status: number): Response {
  return NextResponse.json(
    { success: false, error },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

async function defaultAuthenticate(request: Request): Promise<unknown | null> {
  // O helper e o cliente Supabase só são carregados quando a autenticação
  // padrão é usada. Isso mantém a dependência administrativa fora do bundle
  // de testes das funções puras.
  const { getAuthenticatedUser } = await import('@/lib/auth-server');
  return getAuthenticatedUser(request as NextRequest);
}

function defaultQuery(window: MetricWindow): Promise<AnalyticsOverviewQueryResult> {
  return queryAnalyticsOverview(window);
}

export function createAnalyticsOverviewHandler(
  dependencies: AnalyticsOverviewHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  const authenticate = dependencies.authenticate ?? defaultAuthenticate;
  const query = dependencies.query ?? defaultQuery;

  return async function handleAnalyticsOverview(request: Request): Promise<Response> {
    let user: unknown | null;
    try {
      user = await authenticate(request);
    } catch {
      return jsonError('Autenticação indisponível.', 503);
    }
    if (!user) return jsonError('Não autorizado.', 401);

    let window: MetricWindow;
    try {
      window = parseAnalyticsWindow(new URL(request.url).searchParams);
    } catch {
      return jsonError('Janela analítica inválida.', 400);
    }

    let result: AnalyticsOverviewQueryResult;
    try {
      result = await query(window);
    } catch {
      return jsonError('Dados analíticos indisponíveis.', 503);
    }

    const overview: AnalyticsOverviewResponse = serializeAnalyticsOverview(result.overview);
    if (overview.meta.status === 'unavailable' || overview.meta.status === 'failed') {
      return jsonError('Dados analíticos indisponíveis.', 503);
    }

    return NextResponse.json(overview, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  };
}
