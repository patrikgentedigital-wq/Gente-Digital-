import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = new URL('../../supabase_migration_analytics_sources.sql', import.meta.url);

test('migration analítica existe e cria somente o escopo novo com isolamento explícito', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  for (const table of [
    'integration.opa_records_raw',
    'integration.ixc_records_raw',
    'integration.sync_runs',
    'public.opa_attendances',
    'public.opa_interactions',
    'public.ixc_customers',
    'public.ixc_contracts',
    'public.ixc_sales',
    'public.ixc_cancellations',
    'public.analytics_sync_status',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table.replace('.', '\\.')}`, 'i'));
    assert.match(sql, new RegExp(`ALTER TABLE ${table.replace('.', '\\.')} ENABLE ROW LEVEL SECURITY`, 'i'));
  }

  assert.match(sql, /UNIQUE \(source_system, period_start, period_end\)/i);
  assert.match(sql, /CHECK \(status IN \('success', 'partial', 'failed', 'unavailable'\)\)/i);
  assert.match(sql, /GRANT USAGE ON SCHEMA integration TO service_role/i);
  assert.match(sql, /GRANT ALL ON TABLE integration\.sync_runs TO service_role/i);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.analytics_sync_status TO service_role/i);

  // Esta migration não pode alterar permissões das tabelas já existentes do app.
  assert.doesNotMatch(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA public/i);
  assert.doesNotMatch(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public/i);
  assert.doesNotMatch(sql, /service_role_key|Bearer\s|password\s*=/i);
});
