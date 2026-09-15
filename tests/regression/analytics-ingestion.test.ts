import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildIdempotentUpsert,
  sanitizeSyncError,
} from '../../lib/analytics/ingestion';
import {
  mapIxcCancellationToPersistenceRow,
  mapOpaAttendanceToPersistenceRow,
  RepositoryUnavailableError,
  upsertIxcCancellationBatch,
  upsertOpaAttendanceBatch,
  upsertIxcCancellationBatchDetailed,
  upsertOpaAttendanceBatchDetailed,
  type AnalyticsPersistenceExecutor,
} from '../../lib/analytics/repository';
import { normalizeSourceBusinessDate } from '../../lib/analytics/normalizers';

const opaRecord = (overrides: Record<string, unknown> = {}) => ({
  source_id: 'opa-source-001',
  protocolo: 'protocol-fixture-001',
  contato_bruto: 'identifier-fixture-001',
  tipo_identificador: 'unknown' as const,
  canal: 'fixture-channel',
  status: 'finalized',
  status_vinculo: 'nao_vinculado' as const,
  data_referencia: '2026-09-01T10:00:00-03:00',
  data_finalizacao: '2026-09-01T10:15:00-03:00',
  source_updated_at: '2026-09-01T11:00:00-03:00',
  ...overrides,
});

const ixcRecord = (overrides: Record<string, unknown> = {}) => ({
  source_id: 'ixc-source-001',
  motivo: 'fixture-reason',
  tipo: 'cancelamento' as const,
  data_referencia: '2026-09-01T10:00:00-03:00',
  source_updated_at: '2026-09-01T11:00:00-03:00',
  contract_source_id: 'ixc-contract-001',
  ...overrides,
});

test('buildIdempotentUpsert escolhe a maior data normalizada válida por source_id', () => {
  const result = buildIdempotentUpsert([
    { source_id: 'same', source_updated_at: '2026-09-01T10:00:00Z' },
    { source_id: 'same', source_updated_at: '31/02/2026 11:00:00' },
    { source_id: 'same', source_updated_at: '01/09/2026 11:00:00' },
    { source_id: 'other', source_updated_at: null },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.source_id === 'same')?.source_updated_at, '01/09/2026 11:00:00');
});

test('buildIdempotentUpsert é independente da permutação em timestamps iguais', () => {
  const records = [
    { source_id: 'same', source_updated_at: '2026-09-01T10:00:00Z', value: 'z' },
    { source_id: 'same', source_updated_at: '2026-09-01T10:00:00Z', value: 'a' },
    { source_id: 'other', source_updated_at: null, value: 'b' },
    { source_id: 'other', source_updated_at: 'not-a-date', value: 'a' },
  ];
  const forward = buildIdempotentUpsert(records);
  const reverse = buildIdempotentUpsert([...records].reverse());

  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.map((item) => item.source_id), ['other', 'same']);
  assert.equal(forward.find((item) => item.source_id === 'same')?.value, 'a');
  assert.equal(forward.find((item) => item.source_id === 'other')?.value, 'a');
});

test('buildIdempotentUpsert mantém o vencedor mais recente após qualquer permutação', () => {
  const records = [
    { source_id: 'same', source_updated_at: '2026-09-01T09:00:00Z', value: 'old' },
    { source_id: 'same', source_updated_at: '2026-09-01T11:00:00Z', value: 'new' },
    { source_id: 'same', source_updated_at: '2026-09-01T10:00:00Z', value: 'middle' },
  ];

  assert.deepEqual(buildIdempotentUpsert(records), buildIdempotentUpsert([...records].reverse()));
  assert.equal(buildIdempotentUpsert(records)[0]?.value, 'new');
});

test('buildIdempotentUpsert não considera datas impossíveis, date-only ou formato ambíguo', () => {
  const result = buildIdempotentUpsert([
    { source_id: 'same', source_updated_at: '2026-09-01' },
    { source_id: 'same', source_updated_at: '2026/09/01 11:00:00' },
    { source_id: 'same', source_updated_at: '31/02/2026 12:00:00' },
    { source_id: 'same', source_updated_at: '2026-09-01T10:00:00Z' },
  ]);

  assert.equal(result[0]?.source_updated_at, '2026-09-01T10:00:00Z');
});

test('sanitizeSyncError não devolve token, telefone, payload, protocolo ou credencial', () => {
  const message = sanitizeSyncError(new Error(
    'Bearer segredo-de-teste payload {"telefone":"00000000000"} protocolo ABC-123 credential secret',
  ));

  assert.equal(message, 'Falha na sincronização analítica.');
  for (const secret of ['segredo-de-teste', '00000000000', 'ABC-123', 'secret']) {
    assert.equal(message.includes(secret), false);
  }
});

test('mapper Opa usa somente colunas declaradas e mapeia data_referencia para data_abertura', () => {
  const row = mapOpaAttendanceToPersistenceRow(opaRecord(), 'run-fixture', '2026-09-10T12:00:00.000Z');

  assert.deepEqual(row, {
    source_system: 'opa',
    source_id: 'opa-source-001',
    protocolo: 'protocol-fixture-001',
    contato_bruto: 'identifier-fixture-001',
    tipo_identificador: 'unknown',
    canal: 'fixture-channel',
    status: 'finalized',
    status_vinculo: 'nao_vinculado',
    data_abertura: '2026-09-01T13:00:00.000Z',
    data_finalizacao: '2026-09-01T13:15:00.000Z',
    source_updated_at: '2026-09-01T14:00:00.000Z',
    synced_at: '2026-09-10T12:00:00.000Z',
    sync_run_id: 'run-fixture',
  });
  assert.equal('data_referencia' in row, false);
});

test('mapper IXC usa data_cancelamento e não envia data_referencia', () => {
  const row = mapIxcCancellationToPersistenceRow(ixcRecord(), 'run-fixture', '2026-09-10T12:00:00.000Z');

  assert.deepEqual(row, {
    source_system: 'ixc',
    source_id: 'ixc-source-001',
    contract_source_id: 'ixc-contract-001',
    motivo: 'fixture-reason',
    tipo: 'cancelamento',
    data_cancelamento: '2026-09-01T13:00:00.000Z',
    source_updated_at: '2026-09-01T14:00:00.000Z',
    synced_at: '2026-09-10T12:00:00.000Z',
    sync_run_id: 'run-fixture',
  });
  assert.equal('data_referencia' in row, false);
});

test('data de negócio do IXC aceita date-only no início do dia operacional', () => {
  assert.equal(
    normalizeSourceBusinessDate('2026-09-01'),
    '2026-09-01T03:00:00.000Z',
  );
  assert.equal(
    mapIxcCancellationToPersistenceRow(
      ixcRecord({ data_referencia: '2026-09-01' }),
      'run-fixture',
      '2026-09-10T12:00:00.000Z',
    ).data_cancelamento,
    '2026-09-01T03:00:00.000Z',
  );
});

function successfulFake(capture: { table?: string; rows?: readonly unknown[]; options?: unknown }): AnalyticsPersistenceExecutor {
  return {
    async upsert(table, rows, options) {
      capture.table = table;
      capture.rows = rows;
      capture.options = options;
      return { error: null, persisted: rows.length, inserted: rows.length, updated: 0 };
    },
  };
}

test('upsert Opa usa fake injetado sem rede, payload explícito e onConflict source_id', async () => {
  const capture: { table?: string; rows?: readonly unknown[]; options?: unknown } = {};
  const result = await upsertOpaAttendanceBatchDetailed(
    [opaRecord({ source_id: '000123' })],
    'run-fixture',
    successfulFake(capture),
    '2026-09-10T12:00:00.000Z',
  );

  assert.equal(capture.table, 'opa_attendances');
  assert.deepEqual(capture.options, { onConflict: 'source_id' });
  assert.equal((capture.rows?.[0] as { source_id: string }).source_id, '000123');
  assert.equal('data_referencia' in (capture.rows?.[0] as object), false);
  assert.equal(result.status, 'success');
  assert.equal(result.received, 1);
  assert.equal(result.inserted, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.lastSourceUpdatedAt, '2026-09-01T14:00:00.000Z');
});

test('upsert IXC usa fake injetado sem rede e preserva o contrato da linha', async () => {
  const capture: { table?: string; rows?: readonly unknown[]; options?: unknown } = {};
  const result = await upsertIxcCancellationBatchDetailed(
    [ixcRecord({ source_id: '000456' })],
    'run-fixture',
    successfulFake(capture),
    '2026-09-10T12:00:00.000Z',
  );

  assert.equal(capture.table, 'ixc_cancellations');
  assert.deepEqual(capture.options, { onConflict: 'source_id' });
  assert.equal((capture.rows?.[0] as { source_id: string }).source_id, '000456');
  assert.equal('data_referencia' in (capture.rows?.[0] as object), false);
  assert.equal(result.status, 'success');
  assert.equal(result.inserted, 1);
  assert.equal(result.failed, 0);
});

test('operação detalhada retorna unavailable sanitizado para executor nulo', async () => {
  const result = await upsertOpaAttendanceBatchDetailed([opaRecord()], 'run-fixture', null, '2026-09-10T12:00:00.000Z');

  assert.equal(result.status, 'unavailable');
  assert.equal(result.failed, 1);
  assert.equal(result.errorMessage, 'Persistência analítica indisponível.');
});

test('operação detalhada classifica schema ausente como unavailable sem vazar erro', async () => {
  const result = await upsertIxcCancellationBatchDetailed(
    [ixcRecord()],
    'run-fixture',
    { upsert: async () => ({ error: { code: 'PGRST205', message: 'secret payload and phone' } }) },
    '2026-09-10T12:00:00.000Z',
  );

  assert.equal(result.status, 'unavailable');
  assert.equal(result.failed, 1);
  assert.equal(result.errorMessage, 'Falha na sincronização analítica.');
  assert.equal(result.errorMessage.includes('secret'), false);
});

test('operação detalhada contabiliza lote falho como failed', async () => {
  const result = await upsertOpaAttendanceBatchDetailed(
    [opaRecord({ source_id: 'one' }), opaRecord({ source_id: 'two' })],
    'run-fixture',
    { upsert: async () => ({ error: new Error('database secret') }) },
    '2026-09-10T12:00:00.000Z',
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.failed, 2);
  assert.equal(result.inserted, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.errorMessage, 'Falha na sincronização analítica.');
});

test('erro de lote não aceita failed zero como sucesso silencioso', async () => {
  const result = await upsertIxcCancellationBatchDetailed(
    [ixcRecord()],
    'run-fixture',
    { upsert: async () => ({ error: new Error('database secret'), failed: 0 }) },
    '2026-09-10T12:00:00.000Z',
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.failed, 1);
  assert.equal(result.persisted, 0);
});

test('wrapper compatível não transforma indisponibilidade em sucesso ou zero', async () => {
  await assert.rejects(
    upsertOpaAttendanceBatch([opaRecord()], 'run-fixture', null),
    (error: unknown) => error instanceof RepositoryUnavailableError
      && error.message === 'Persistência analítica indisponível.',
  );
});
