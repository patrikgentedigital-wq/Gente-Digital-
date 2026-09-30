import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { createPostSaleHandlers } from '@/lib/post-sale/handlers';

const collectionId = '33333333-3333-4333-8333-333333333333';

function makeHandler(role: 'admin' | 'vendedor') {
  const changes: unknown[] = [];
  const handlers = createPostSaleHandlers({
    authenticate: async () => ({ id: 'admin-user', email: 'admin@example.test' }),
    getRole: async () => role,
    resolveColaborador: async () => ({ id: 'EMP-042', name: 'Vendedora' }),
    createIxcGateway: async () => { throw new Error('not used'); },
    store: {
      correctCollectionCollector: async (input: unknown) => {
        changes.push(input);
        return { found: true, changed: true };
      },
    } as never,
    now: () => '2026-09-30T12:00:00.000Z',
  });
  return { handlers, changes };
}

function request(body: unknown): Request {
  return new Request(`http://localhost/api/post-sale/collections/${collectionId}/collector`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('correção de coletor exige admin, justificativa e persiste autor e destino', async () => {
  const seller = makeHandler('vendedor');
  const denied = await seller.handlers.correctCollectionCollector(request({
    collectorColaboradorId: 'EMP-007',
    reason: 'Ajuste confirmado com a equipe.',
  }), collectionId);
  assert.equal(denied.status, 403);
  assert.equal(seller.changes.length, 0);

  const admin = makeHandler('admin');
  const invalid = await admin.handlers.correctCollectionCollector(request({
    collectorColaboradorId: 'EMP-007',
    reason: 'corrigir',
  }), collectionId);
  assert.equal(invalid.status, 400);
  assert.equal(admin.changes.length, 0);

  const corrected = await admin.handlers.correctCollectionCollector(request({
    collectorColaboradorId: 'EMP-007',
    reason: 'Ajuste confirmado com a equipe.',
  }), collectionId);
  assert.equal(corrected.status, 200);
  assert.deepEqual(admin.changes, [{
    collectionId,
    collectorColaboradorId: 'EMP-007',
    changedBy: 'admin-user',
    reason: 'Ajuste confirmado com a equipe.',
    changedAt: '2026-09-30T12:00:00.000Z',
  }]);
});

test('migration de atribuição mantém trilha imutável via RPC restrita', () => {
  const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url);
  const migrationFile = existsSync(migrationDirectory)
    ? readdirSync(migrationDirectory).find((file) => /_post_sale_attribution_audit\.sql$/i.test(file))
    : undefined;
  assert.ok(migrationFile, 'deve existir migration própria para a correção auditada de coletor');
  const sql = readFileSync(new URL(migrationFile!, migrationDirectory), 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.post_sale_collection_attribution_audit/i);
  assert.match(sql, /old_colaborador_id\s+text\s+not null/i);
  assert.match(sql, /new_colaborador_id\s+text\s+not null/i);
  assert.match(sql, /changed_by\s+uuid\s+not null/i);
  assert.match(sql, /reason\s+text\s+not null/i);
  assert.match(sql, /post_sale_collection_id\s+uuid\s+not null\s+references public\.post_sale_collections\s*\(id\)\s+on delete restrict/i);
  assert.match(sql, /alter table public\.post_sale_collection_attribution_audit enable row level security/i);
  assert.match(sql, /revoke all on table public\.post_sale_collection_attribution_audit from anon, authenticated/i);
  assert.match(sql, /grant select, insert on table public\.post_sale_collection_attribution_audit to service_role/i);
  assert.doesNotMatch(sql, /grant[^;]*\b(?:update|delete|all)\b[^;]*post_sale_collection_attribution_audit/i);
  assert.match(sql, /grant update \(collector_colaborador_id, updated_at\)[\s\S]*?on table public\.post_sale_collections to service_role/i);
  assert.match(sql, /create(?: or replace)? function public\.correct_post_sale_collection_collector/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /insert into public\.post_sale_collection_attribution_audit/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke execute on function public\.correct_post_sale_collection_collector[\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /grant execute on function public\.correct_post_sale_collection_collector[\s\S]*?to service_role/i);
  assert.doesNotMatch(sql, /security definer/i);
});
