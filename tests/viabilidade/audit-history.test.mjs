import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as audit from '../../.test-build/viabilidade/audit.js';

test('historico limita e ordena registros sem devolver campos privados injetados',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'viability-history-'));
  try {
    const record={id:'test-1',evaluatedAt:'2026-10-05T12:00:00Z',origin:'DEMO',status:'ANALISE_TECNICA',region:'AC',leadId:5,recommendedCtoId:null,reasons:['TRAJETO_NAO_CONFIRMADO'],policyVersion:'test',sourceTimes:{ixcFetchedAt:'x',sheetsFetchedAt:'x'},candidates:[],address:'PRIVATE ADDRESS',token:'PRIVATE TOKEN'};
    await writeFile(join(dir,'decisions-2026-10-05.jsonl'),JSON.stringify(record)+'\n'+JSON.stringify({...record,id:'test-2',evaluatedAt:'2026-10-05T13:00:00Z'})+'\n');
    const rows=await audit.createAuditReader(dir,1)();
    assert.equal(rows.length,1);assert.equal(rows[0].id,'test-2');
    assert.equal(rows[0].leadId,5);
    assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);
    await writeFile(join(dir,'decisions-2026-10-06.jsonl'),'not json\n');
    await assert.rejects(audit.createAuditReader(dir)(),/AUDIT_HISTORY_INVALID/);
  } finally {await rm(dir,{recursive:true,force:true})}
});
test('auditoria preserva a origem e componentes da rota OSM sem gravar a polilinha',async()=>{
  const decision={id:'osm-audit',evaluatedAt:'2026-10-07T14:30:29Z',origin:'LIVE',status:'ANALISE_TECNICA',region:'CP',recommendedCtoId:null,reasons:['CANDIDATA_COM_DADOS_INSUFICIENTES'],policyVersion:'test',
    sources:{ixcFetchedAt:'ixc',sheetsFetchedAt:'sheets',roadGraphVersion:'0123456789abcdefabcd',roadGraphUpdatedAt:'2026-10-07T14:30:29Z'},
    candidates:[{ctoId:'541',status:'ANALISE_TECNICA',reasons:['TRAJETO_ESTIMADO_OSM'],routeMeters:177.2,routeSource:'OSM_ESTIMATE',routeComponents:{lineMeters:150,installAccessMeters:3,ctoAccessMeters:4.2,reserveMeters:20,totalMeters:177.2},ixcCapacity:8,sheetCapacity:8,points:[{latitude:1,longitude:2}]}]};
  const stored=audit.auditRecord(decision);
  assert.equal(stored.candidates[0].routeSource,'OSM_ESTIMATE');
  assert.deepEqual(stored.candidates[0].routeComponents,decision.candidates[0].routeComponents);
  assert.equal(stored.sourceTimes.roadGraphVersion,'0123456789abcdefabcd');
  assert.equal(Object.hasOwn(stored.candidates[0],'points'),false);
});
test('retencao remove somente arquivos diarios vencidos, preservando arquivos estranhos e dia atual',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'viability-retention-'));
  try {
    for(const name of ['decisions-2026-01-01.jsonl','decisions-2026-10-05.jsonl','keep.txt','decisions-invalid.jsonl'])await writeFile(join(dir,name),'');
    const writer=audit.createAuditWriter(dir,()=>new Date('2026-10-05T14:00:00Z'),30,8);
    await writer({id:'test',evaluatedAt:'2026-10-05T14:00:00Z',origin:'DEMO',region:'CP',status:'INVIAVEL',recommendedCtoId:null,reasons:[],policyVersion:'test',sources:{ixcFetchedAt:'x',sheetsFetchedAt:'x'},candidates:[]});
    const files=await readdir(dir);assert.equal(files.includes('decisions-2026-01-01.jsonl'),false);
    assert.ok(files.includes('decisions-2026-10-05.jsonl'));assert.ok(files.includes('keep.txt'));assert.ok(files.includes('decisions-invalid.jsonl'));
    const rows=await audit.createAuditReader(dir)();assert.equal(rows[0].leadId,8);
  } finally {await rm(dir,{recursive:true,force:true})}
});
