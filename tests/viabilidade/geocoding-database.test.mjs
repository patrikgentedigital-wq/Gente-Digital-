import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('controle compartilhado limita pesquisas entre instancias e mantem cache restrito ao servidor', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    await db.exec(await readFile(new URL('../../supabase/migrations/202610060002_viability_geocoding.sql', import.meta.url), 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select public.viability_claim_geocoding_slot()'), e => e.code === '42501');
      await assert.rejects(db.query('select * from public.viability_geocoding_cache'), e => e.code === '42501');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await db.query('select public.viability_claim_geocoding_slot() as granted')).rows[0].granted, true);
    assert.equal((await db.query('select public.viability_claim_geocoding_slot() as granted')).rows[0].granted, false);
    await db.exec("update public.viability_geocoding_gate set last_started_at = clock_timestamp() - interval '2 seconds'");
    assert.equal((await db.query('select public.viability_claim_geocoding_slot() as granted')).rows[0].granted, true);
    await db.query('insert into public.viability_geocoding_cache(query_hash,places,expires_at) values ($1,$2,now()+interval \'1 day\')', ['a'.repeat(64), '[]']);
    assert.equal((await db.query('select count(*)::int as count from public.viability_geocoding_cache')).rows[0].count, 1);
    await db.exec('reset role');
    const rls = await db.query("select relrowsecurity from pg_class where relname in ('viability_geocoding_gate','viability_geocoding_cache')");
    assert.ok(rls.rows.every(r => r.relrowsecurity));
    assert.equal(rls.rows.length, 2);
  } finally { await db.close(); }
});
