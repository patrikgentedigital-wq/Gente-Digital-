import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseAnalyticsWindow, queryAnalyticsOverview } from '../../lib/analytics/query';
import { serializeAnalyticsOverview } from '../../lib/analytics/response';
import { createAnalyticsOverviewHandler } from '../../lib/analytics/overview-handler';
import type { AnalyticsOverviewResponse } from '../../lib/analytics/response';

const overview: AnalyticsOverviewResponse = {
  success: true,
  data: {
    geral: { leads: 2, sales: 1, contracts: 1, preContracts: 0 },
    atendimento: {
      total: 2,
      linked: 1,
      unlinked: 1,
      ambiguous: 0,
      notApplicable: 0,
      protocolConflicts: 0,
      byChannel: [{ key: 'whatsapp', count: 2 }],
      byStatus: [{ key: 'finalizado', count: 2 }],
    },
    cancelamentos: {
      total: 1,
      byReason: [{ key: 'mudança', count: 1 }],
      renewals: 0,
      upgrades: 0,
      downgrades: 0,
    },
  },
  meta: {
    from: '2026-09-01T03:00:00.000Z',
    to: '2026-10-01T02:59:59.000Z',
    lastUpdatedAt: '2026-09-10T15:00:00.000Z',
    status: 'success',
    coverage: 1,
    sections: {
      geral: 'success',
      atendimento: 'success',
      cancelamentos: 'success',
    },
  },
};

test('parseAnalyticsWindow aplica janela padrão no timezone do negócio', () => {
  const window = parseAnalyticsWindow(new URLSearchParams());

  assert.equal(window.timezone, 'America/Sao_Paulo');
  assert.equal(window.from, null);
  assert.equal(window.to, null);
});

test('parseAnalyticsWindow rejeita data inválida e date-only', () => {
  assert.throws(
    () => parseAnalyticsWindow(new URLSearchParams({ from: 'data-invalida' })),
    /data/i,
  );
  assert.throws(
    () => parseAnalyticsWindow(new URLSearchParams({ from: '2026-09-01' })),
    /data/i,
  );
});

test('parseAnalyticsWindow rejeita janela invertida', () => {
  assert.throws(
    () => parseAnalyticsWindow(new URLSearchParams({
      from: '2026-09-10T12:00:00-03:00',
      to: '2026-09-01T12:00:00-03:00',
    })),
    /janela|período/i,
  );
});

test('serializeAnalyticsOverview mantém o contrato e remove payloads extras', () => {
  const serialized = serializeAnalyticsOverview({
    ...overview,
    data: {
      ...overview.data,
      geral: { ...overview.data.geral, providerPayload: { secret: 'não retornar' } },
    },
    meta: { ...overview.meta, providerError: 'token e schema interno' },
    raw: { telefone: '00000000000' },
  } as AnalyticsOverviewResponse & Record<string, unknown>);

  assert.deepEqual(serialized, overview);
  assert.equal(JSON.stringify(serialized).includes('não retornar'), false);
  assert.equal(JSON.stringify(serialized).includes('telefone'), false);
});

test('rota retorna 401 sem sessão e não consulta a fonte', async () => {
  let queried = false;
  const handler = createAnalyticsOverviewHandler({
    authenticate: async () => null,
    query: async () => {
      queried = true;
      return { overview };
    },
  });

  const response = await handler(new Request('http://localhost/api/analytics/overview'));

  assert.equal(response.status, 401);
  assert.equal(queried, false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('rota retorna 503 quando o serviço de autenticação falha', async () => {
  const handler = createAnalyticsOverviewHandler({
    authenticate: async () => { throw new Error('detalhe interno'); },
    query: async () => ({ overview }),
  });

  const response = await handler(new Request('http://localhost/api/analytics/overview'));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Autenticação indisponível.',
  });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('rota retorna 400 para janela inválida e não consulta a fonte', async () => {
  let queried = false;
  const handler = createAnalyticsOverviewHandler({
    authenticate: async () => ({ id: 'user-fixture', user_metadata: { role: 'admin' } }),
    query: async () => {
      queried = true;
      return { overview };
    },
  });

  const response = await handler(new Request(
    'http://localhost/api/analytics/overview?from=2026-09-01',
  ));

  assert.equal(response.status, 400);
  assert.equal(queried, false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('rota retorna 503 sem transformar indisponibilidade em zeros de sucesso', async () => {
  const unavailable: AnalyticsOverviewResponse = {
    ...overview,
    meta: { ...overview.meta, status: 'unavailable', coverage: 0 },
  };
  const handler = createAnalyticsOverviewHandler({
    authenticate: async () => ({ id: 'user-fixture', user_metadata: { role: 'admin' } }),
    query: async () => ({ overview: unavailable }),
  });

  const response = await handler(new Request('http://localhost/api/analytics/overview'));
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.deepEqual(body, { success: false, error: 'Dados analíticos indisponíveis.' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('rota serializa sucesso autenticado, aplica no-store e não autoriza por user_metadata', async () => {
  const handler = createAnalyticsOverviewHandler({
    authenticate: async () => ({ id: 'user-fixture', user_metadata: { role: 'admin' } }),
    query: async (window) => {
      assert.equal(window.timezone, 'America/Sao_Paulo');
      return { overview };
    },
  });

  const response = await handler(new Request(
    'http://localhost/api/analytics/overview?from=2026-09-01T00:00:00-03:00&to=2026-09-30T23:59:59-03:00',
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, overview);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('rota preserva o estado partial e sua cobertura', async () => {
  const partial: AnalyticsOverviewResponse = {
    ...overview,
    meta: { ...overview.meta, status: 'partial', coverage: 0.4 },
  };
  const handler = createAnalyticsOverviewHandler({
    authenticate: async () => ({ id: 'user-fixture' }),
    query: async () => ({ overview: partial }),
  });

  const response = await handler(new Request('http://localhost/api/analytics/overview'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.meta.status, 'partial');
  assert.equal(body.meta.coverage, 0.4);
});

test('rota e query declaram a fronteira server-only', () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

  assert.match(read('lib/analytics/query.ts'), /import\(['"]\.\.\/supabase-admin['"]\)/);
  assert.match(read('lib/analytics/overview-handler.ts'), /import\(['"]@\/lib\/auth-server['"]\)/);
  assert.doesNotMatch(read('lib/analytics/overview-handler.ts'), /user_metadata/);
});

test('query sem Supabase configurado termina em unavailable sem usar valores demo', async () => {
  const result = await queryAnalyticsOverview(parseAnalyticsWindow(new URLSearchParams()), {
    configured: false,
  });

  assert.equal(result.overview.meta.status, 'unavailable');
  assert.equal(result.overview.meta.coverage, 0);
  assert.equal(result.overview.meta.lastUpdatedAt, null);
});
