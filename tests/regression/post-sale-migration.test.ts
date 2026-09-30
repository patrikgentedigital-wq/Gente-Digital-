import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url);
const migrationFiles = existsSync(migrationDirectory)
  ? readdirSync(migrationDirectory).filter((file) => /_post_sale_referrals\.sql$/i.test(file))
  : [];

test('migration de pós-venda cria o modelo mínimo e habilita RLS', () => {
  assert.equal(migrationFiles.length, 1, 'deve existir uma migration gerada pelo CLI para post_sale_referrals');
  const sql = readFileSync(new URL(migrationFiles[0], migrationDirectory), 'utf8');

  for (const table of [
    'public.post_sale_collections',
    'public.post_sale_contacts',
    'public.post_sale_conversions',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table.replaceAll('.', '\\.')}`, 'i'));
    assert.match(sql, new RegExp(`ALTER TABLE ${table.replaceAll('.', '\\.')} ENABLE ROW LEVEL SECURITY`, 'i'));
  }

  assert.match(sql, /origin_contract_id\s+text\s+not null\s+unique/i);
  assert.match(sql, /collector_colaborador_id\s+text\s+not null/i);
  assert.match(sql, /recorded_by\s+uuid\s+not null/i);
  assert.match(sql, /contacts_collected/i);
  assert.match(sql, /no_referral/i);
  assert.match(sql, /post_sale_collection_id\s+uuid/i);
  assert.match(sql, /foreign key\s*\(post_sale_collection_id\)\s*references\s+public\.post_sale_collections\s*\(id\)\s+on delete set null/i);
  assert.match(sql, /format_type\s*\(\s*lead_id_column\.atttypid\s*,\s*lead_id_column\.atttypmod\s*\)/i);
  assert.match(sql, /add column(?: if not exists)? lead_id %s/i);
  assert.match(sql, /foreign key\s*\(lead_id\)\s*references\s+public\.leads\s*\(id\)\s+on delete set null/i);
  assert.match(sql, /ixc_contract_id\s+text\s+not null\s+unique/i);
  assert.match(sql, /pending_review/i);
  assert.match(sql, /duplicate_existing/i);
  assert.match(sql, /no_referral/i);
});

test('RPC de coleta é transacional e não pode ser chamada por roles públicas', () => {
  assert.equal(migrationFiles.length, 1, 'deve existir uma migration gerada pelo CLI para post_sale_referrals');
  const sql = readFileSync(new URL(migrationFiles[0], migrationDirectory), 'utf8');

  assert.match(sql, /create(?: or replace)? function public\.create_post_sale_collection_with_contacts\s*\(/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path\s*=/i);
  assert.match(sql, /revoke execute on function public\.create_post_sale_collection_with_contacts[\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /grant execute on function public\.create_post_sale_collection_with_contacts[\s\S]*?to service_role/i);
  assert.match(sql, /on conflict\s*\(origin_contract_id\)\s*do nothing/i);
  assert.match(sql, /regexp_replace\s*\(\s*coalesce\s*\(\s*lead_row\.phone/i);
  assert.match(sql, /ref\s*,\s*status\s*,\s*value\s*,\s*source\s*,\s*created_at\s*,\s*post_sale_collection_id/i);
  assert.match(sql, /p_origin_customer_ref/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.leads/i);
  assert.doesNotMatch(sql, /update\s+public\.leads\s+set\s+ref/i);
});

test('migration concede acesso somente às tabelas novas e não revoga permissões globais', () => {
  assert.equal(migrationFiles.length, 1, 'deve existir uma migration gerada pelo CLI para post_sale_referrals');
  const sql = readFileSync(new URL(migrationFiles[0], migrationDirectory), 'utf8');

  const grants = sql.match(/grant\b[\s\S]*?;/gi) ?? [];
  const revokes = sql.match(/revoke\b[\s\S]*?;/gi) ?? [];
  const expectedTablePrivileges = new Map([
    ['public.post_sale_collections', /select\s*,\s*insert/i],
    ['public.post_sale_contacts', /select\s*,\s*insert/i],
    ['public.post_sale_conversions', /select\s*,\s*insert\s*,\s*update/i],
  ]);
  for (const table of [
    'public.post_sale_collections',
    'public.post_sale_contacts',
    'public.post_sale_conversions',
  ]) {
    const tablePattern = new RegExp(`\\b${table.replaceAll('.', '\\.')}\\b`, 'i');
    assert.ok(
      grants.some((grant) => tablePattern.test(grant) && /\bto\s+service_role\b/i.test(grant)),
      `a migration deve conceder acesso explícito de service_role a ${table}`,
    );
    assert.ok(
      grants.some((grant) => tablePattern.test(grant) && expectedTablePrivileges.get(table)?.test(grant)),
      `a migration deve usar apenas os privilégios necessários em ${table}`,
    );
    assert.ok(
      revokes.some((revoke) => tablePattern.test(revoke) && /\ball\b[\s\S]*?\bfrom\s+anon,\s*authenticated\b/i.test(revoke)),
      `a migration deve bloquear acesso direto de anon e authenticated a ${table}`,
    );
  }

  assert.doesNotMatch(sql, /grant[^;]*\bto\s+(?:anon|authenticated)\b/i);
  assert.doesNotMatch(sql, /revoke all on all tables in schema public/i);
  assert.doesNotMatch(sql, /alter default privileges in schema public/i);
  assert.doesNotMatch(sql, /service_role_key|bearer\s|password\s*=/i);
});
