import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('migracao PostgreSQL separa historico e restringe leitura por usuario/admin e escrita ao servidor',async()=>{
  const db=new PGlite();
  const u1='00000000-0000-4000-8000-000000000001',u2='00000000-0000-4000-8000-000000000002',admin='00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      alter default privileges in schema public grant all on tables to service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;
      grant usage on schema public to service_role;
      grant execute on function auth.uid() to anon,authenticated;
      create table public.leads(id integer primary key);
      create table public.user_roles(user_id uuid primary key,role text);
      grant select on public.user_roles to authenticated;
      insert into auth.users values ('${u1}'),('${u2}'),('${admin}');
      insert into public.user_roles values ('${u1}','vendedor'),('${u2}','vendedor'),('${admin}','admin');
      insert into public.leads values(8);`);
    await db.exec(await readFile(new URL('../../supabase/migrations/202610050001_viability_evaluations.sql',import.meta.url),'utf8'));
    for(const [i,user] of [[1,u1],[2,u2]])await db.query(`insert into public.viability_evaluations(decision_id,user_id,lead_id,result) values($1,$2,8,$3)`,[`00000000-0000-4000-9000-00000000000${i}`,user,JSON.stringify({origin:'DEMO',status:'ANALISE_TECNICA'})]);
    await db.exec('set role anon');await assert.rejects(db.query('select * from public.viability_evaluations'),e=>e.code==='42501');
    await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${u1}',false)`);
    const own=await db.query('select user_id from public.viability_evaluations');assert.deepEqual(own.rows,[{user_id:u1}]);
    for(const sql of ['insert into public.viability_evaluations(decision_id,user_id,result) values(gen_random_uuid(),auth.uid(),\'{"origin":"LIVE","status":"VIAVEL"}\')',
      'update public.viability_evaluations set result=\'{"origin":"LIVE","status":"VIAVEL"}\'',
      'delete from public.viability_evaluations'])await assert.rejects(db.query(sql),e=>e.code==='42501');
    await db.exec(`select set_config('request.jwt.claim.sub','${u2}',false)`);
    assert.deepEqual((await db.query('select user_id from public.viability_evaluations')).rows,[{user_id:u2}]);
    await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
    assert.equal((await db.query('select * from public.viability_evaluations')).rows.length,2);
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await db.query('select * from public.viability_evaluations')).rows.length,0);
    await db.exec('reset role;set role service_role');
    for(const sql of ['update public.viability_evaluations set lead_id=null','delete from public.viability_evaluations','truncate public.viability_evaluations'])await assert.rejects(db.query(sql),e=>e.code==='42501');
    await db.query(`insert into public.viability_evaluations(decision_id,user_id,lead_id,result) values($1,$2,8,$3)`,['00000000-0000-4000-9000-000000000004',u1,JSON.stringify({origin:'LIVE',status:'VIAVEL'})]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as count from public.viability_evaluations')).rows[0].count,3);
    await assert.rejects(db.query(`insert into public.viability_evaluations(decision_id,user_id,result) values(gen_random_uuid(),$1,'{}')`,[u1]),e=>e.code==='23514');
    assert.equal((await db.query('select count(*)::int as count from public.leads')).rows[0].count,1);
  }finally{await db.close()}
});
