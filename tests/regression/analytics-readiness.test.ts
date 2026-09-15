import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseAnalyticsWindow,
  queryAnalyticsOverview,
  type AnalyticsQueryDataset,
} from '../../lib/analytics/query';
import type { AnalyticsSyncStatusRecord } from '../../lib/analytics/types';

const window = parseAnalyticsWindow(new URLSearchParams({
  from: '2026-09-01T00:00:00-03:00',
  to: '2026-09-30T23:59:59-03:00',
}));

function dataset(overrides: Partial<AnalyticsQueryDataset> = {}): AnalyticsQueryDataset {
  return {
    leads: [{ source_id: 'lead-1', data_referencia: '2026-09-10T10:00:00-03:00' }],
    sales: [],
    contracts: [],
    preContracts: [],
    attendance: [],
    cancellations: [],
    availableSources: ['leads', 'sales', 'contracts', 'attendance', 'cancellations'],
    failedSources: [],
    syncStatuses: [],
    lastUpdatedAt: null,
    ...overrides,
  };
}

test('query não trata tabelas vazias como sucesso sem status de sincronização', async () => {
  const result = await queryAnalyticsOverview(window, {
    configured: true,
    executor: { load: async () => dataset() },
  });

  assert.equal(result.overview.meta.status, 'partial');
  assert.equal(result.overview.meta.coverage, 0.2);
  assert.equal(result.overview.data.geral.leads, 1);
  assert.equal(result.overview.data.geral.sales, null);
  assert.equal(result.overview.data.geral.contracts, null);
  assert.equal(result.overview.data.geral.preContracts, null);
});

test('query libera Opa e IXC somente quando o status cobre a janela consultada', async () => {
  const syncStatuses: AnalyticsSyncStatusRecord[] = [
    {
      source_system: 'opa',
      period_start: '2026-09-01T03:00:00.000Z',
      period_end: '2026-10-01T02:59:59.000Z',
      status: 'success',
      synced_at: '2026-09-14T12:00:00.000Z',
    },
    {
      source_system: 'ixc',
      period_start: '2026-09-01T03:00:00.000Z',
      period_end: '2026-10-01T02:59:59.000Z',
      status: 'success',
      synced_at: '2026-09-14T12:00:00.000Z',
    },
  ];

  const result = await queryAnalyticsOverview(window, {
    configured: true,
    executor: { load: async () => dataset({ syncStatuses }) },
  });

  assert.equal(result.overview.meta.status, 'partial');
  assert.equal(result.overview.meta.coverage, 0.6);
  assert.equal(result.overview.data.geral.sales, null);
  assert.equal(result.overview.data.geral.contracts, null);
  assert.equal(result.overview.data.cancelamentos.total, 0);
});

test('status partial de uma fonte mantém a leitura bloqueada para não declarar paridade', async () => {
  const syncStatuses: AnalyticsSyncStatusRecord[] = [
    {
      source_system: 'opa',
      period_start: '2026-09-01T03:00:00.000Z',
      period_end: '2026-10-01T02:59:59.000Z',
      status: 'partial',
      synced_at: '2026-09-14T12:00:00.000Z',
    },
    {
      source_system: 'ixc',
      period_start: '2026-09-01T03:00:00.000Z',
      period_end: '2026-10-01T02:59:59.000Z',
      status: 'success',
      synced_at: '2026-09-14T12:00:00.000Z',
    },
  ];

  const result = await queryAnalyticsOverview(window, {
    configured: true,
    executor: { load: async () => dataset({ syncStatuses }) },
  });

  assert.equal(result.overview.meta.status, 'partial');
  assert.equal(result.overview.meta.coverage, 0.6);
});

test('estado geral parcial não esconde seções OPA e IXC confirmadas', async () => {
  const syncStatuses: AnalyticsSyncStatusRecord[] = [
    {
      source_system: 'opa',
      period_start: '2026-09-01T03:00:00.000Z',
      period_end: '2026-10-01T02:59:59.000Z',
      status: 'success',
      synced_at: '2026-09-14T12:00:00.000Z',
    },
    {
      source_system: 'ixc',
      period_start: '2026-09-01T03:00:00.000Z',
      period_end: '2026-10-01T02:59:59.000Z',
      status: 'success',
      synced_at: '2026-09-14T12:00:00.000Z',
    },
  ];

  const result = await queryAnalyticsOverview(window, {
    configured: true,
    executor: {
      load: async () => dataset({
        syncStatuses,
        attendance: [{
          source_id: 'opa-attendance-1',
          protocolo: 'protocol-1',
          contato_bruto: 'raw-contact-1',
          tipo_identificador: 'unknown',
          canal: 'whatsapp',
          status: 'F',
          status_vinculo: 'nao_vinculado',
          data_referencia: '2026-09-10T10:00:00-03:00',
        }],
        cancellations: [{
          source_id: 'ixc-cancellation-1',
          motivo: 'motivo-teste',
          tipo: 'cancelamento',
          data_referencia: '2026-09-10T10:00:00-03:00',
        }],
      }),
    },
  });

  const sections = (result.overview.meta as typeof result.overview.meta & {
    sections?: Record<'geral' | 'atendimento' | 'cancelamentos', string>;
  }).sections;

  assert.deepEqual(sections, {
    geral: 'partial',
    atendimento: 'success',
    cancelamentos: 'success',
  });
  assert.equal(result.overview.data.atendimento.total, 1);
  assert.equal(result.overview.data.cancelamentos.total, 1);
});

test('seção sem sincronização válida não devolve zero como dado confirmado', async () => {
  const result = await queryAnalyticsOverview(window, {
    configured: true,
    executor: {
      load: async () => dataset({
        syncStatuses: [],
        attendance: [{
          source_id: 'opa-attendance-stale',
          protocolo: 'protocol-stale',
          contato_bruto: 'raw-contact-stale',
          tipo_identificador: 'unknown',
          canal: 'whatsapp',
          status: 'F',
          status_vinculo: 'nao_vinculado',
          data_referencia: '2026-09-10T10:00:00-03:00',
        }],
      }),
    },
  });

  const sections = (result.overview.meta as typeof result.overview.meta & {
    sections?: Record<'geral' | 'atendimento' | 'cancelamentos', string>;
  }).sections;

  assert.notEqual(sections?.atendimento, 'success');
  assert.equal(result.overview.data.atendimento.total, null);
});
