import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildIdempotentUpsert, sanitizeSyncError } from '../../lib/analytics/ingestion';
import {
  RepositoryUnavailableError,
  upsertIxcCancellationBatch,
  upsertOpaAttendanceBatch,
} from '../../lib/analytics/repository';

test('buildIdempotentUpsert escolhe a maior data válida por source_id', () => {
  const result = buildIdempotentUpsert([
    { source_id: 'same', source_updated_at: '2026-09-01T10:00:00Z' },
    { source_id: 'same', source_updated_at: 'not-a-date' },
    { source_id: 'same', source_updated_at: '2026-09-01T11:00:00Z' },
    { source_id: 'other', source_updated_at: null },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.source_id === 'same')?.source_updated_at, '2026-09-01T11:00:00Z');
});

test('buildIdempotentUpsert mantém ordem de primeira ocorrência e desempate determinístico', () => {
  const result = buildIdempotentUpsert([
    { source_id: 'b', source_updated_at: null },
    { source_id: 'a', source_updated_at: null },
    { source_id: 'b', source_updated_at: null, value: 'latest-input' },
  ]);

  assert.deepEqual(result.map((item) => item.source_id), ['b', 'a']);
  assert.equal((result[0] as { value?: string }).value, 'latest-input');
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

test('upsert Opa falha explicitamente quando o cliente admin não está disponível', async () => {
  await assert.rejects(
    upsertOpaAttendanceBatch([], 'run-id'),
    (error: unknown) => error instanceof RepositoryUnavailableError
      && error.message === 'Persistência analítica indisponível.',
  );
});

test('upsert IXC falha explicitamente quando o cliente admin não está disponível', async () => {
  await assert.rejects(
    upsertIxcCancellationBatch([], 'run-id'),
    (error: unknown) => error instanceof RepositoryUnavailableError
      && error.message === 'Persistência analítica indisponível.',
  );
});
