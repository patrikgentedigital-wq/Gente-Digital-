import test from 'node:test';
import assert from 'node:assert/strict';
import {createViabilityHandler} from '../../.test-build/viabilidade/handler.js';
import {createDemoSources} from '../../.test-build/viabilidade/adapters/demo.js';

test('consulta LIVE nunca utiliza politica ou trajeto ficticio e preserva a origem no historico', async()=>{
  const demo=createDemoSources();
  const sources={loadIxc:async r=>({...await demo.loadIxc(r),origin:'LIVE'}),loadSheets:async r=>({...await demo.loadSheets(r),origin:'LIVE'})};
  let saved;
  const handler=createViabilityHandler({enabled:true,origin:'LIVE',sources,authenticate:async()=>({id:'user'}),authorizeLead:async()=>true,save:async d=>{saved=d},history:async()=>[]});
  const response=await handler(new Request('https://painel.example/api/viabilidade',{method:'POST',headers:{origin:'https://painel.example','content-type':'application/json'},body:JSON.stringify({region:'AC',latitude:12.345,longitude:45.678})}));
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.origin,'LIVE');assert.equal(body.status,'ANALISE_TECNICA');
  assert.ok(body.reasons.includes('REGRA_VALIDADE_NAO_CONFIGURADA'));assert.equal(saved.origin,'LIVE');
  assert.equal(body.candidates.find(x=>x.ctoId==='DEMO-AC-01').available,4);
  const status=await (await handler(new Request('https://painel.example/api/viabilidade?view=status'))).json();
  assert.equal(status.mode,'LIVE');assert.equal(status.productionReady,false);
});

test('CSV publico respeita aspas, quebras de linha e nao devolve observacoes de clientes',async()=>{
  const {parseCsv,createPublicSheetsAdapter}=await import('../../.test-build/viabilidade/adapters/public-sheets.js');
  assert.deepEqual(parseCsv('\uFEFFa,"b,b","c""d"\r\n1,"linha\n2",3'),[['a','b,b','c"d'],['1','linha\n2','3']]);
  assert.throws(()=>parseCsv('a,"incompleto'));
  const header='gente,SPLITT,FIBRA >,VAGAS,PON,LUZ,LOCALIZAÇÃO,BAIRRO / RUA,TEC,DATA,IDENTIF,ALTERADO,OBS1,OBS2,OBS3';
  const csv=header+'\r\nN-01,1X16,,3,,,"-1.1, -47.1",,,06/10/2026,,,"nota privada, com vírgula",,';
  let target;
  const adapter=createPublicSheetsAdapter('1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ',async(url,options)=>{target=new URL(url);assert.equal(options.method,'GET');return new Response(csv,{headers:{'content-type':'text/csv'}})});
  const snapshot=await adapter.loadSheets('CP');
  assert.equal(snapshot.complete,true);assert.equal(snapshot.origin,'LIVE');assert.equal(snapshot.rows[0].available,3);assert.equal(snapshot.rows[0].row,2);
  assert.equal(target.searchParams.get('gid'),'670146227');assert.equal(target.searchParams.get('range'),'A:O');
  assert.equal(JSON.stringify(snapshot).includes('nota privada'),false);
});

test('leitura CSV recusa login, esquema alterado e redirecionamento fora do Google',async()=>{
  const {createPublicSheetsAdapter}=await import('../../.test-build/viabilidade/adapters/public-sheets.js');
  for(const response of [new Response('<html>Login</html>',{headers:{'content-type':'text/html'}}),new Response('coluna alterada',{headers:{'content-type':'text/csv'}}),new Response(null,{status:302,headers:{location:'https://external.invalid/'}})]){
    let calls=0;const adapter=createPublicSheetsAdapter('1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ',async()=>{calls++;return response});
    const snapshot=await adapter.loadSheets('AC');assert.equal(snapshot.complete,false);assert.equal(snapshot.origin,'LIVE');assert.ok(snapshot.issues.length);assert.equal(calls,1);
  }
});

test('planilha mantida em tempo real usa vagas da leitura atual sem reprovar pela data historica da linha',async()=>{
  const {decide}=await import('../../.test-build/viabilidade/domain/decide.js');const sources=createDemoSources();
  const ixc={...await sources.loadIxc('AC'),origin:'LIVE'};const sheet={...await sources.loadSheets('AC'),origin:'LIVE'};
  sheet.rows[0].updatedOn='2025-05-28';
  const request={region:'AC',location:{latitude:12.345,longitude:45.678}};
  const decision=decide(request,ixc,sheet,[{ctoId:'DEMO-AC-01',location:request.location,meters:320,confirmedAt:new Date().toISOString(),reference:'medicao-tecnica'}],{maxDistanceMeters:500,maxUpdateAgeDays:null,freshnessMode:'CURRENT_SNAPSHOT',version:'live-current-snapshot-v1',regionalCoverageConfirmed:true},new Date());
  assert.equal(decision.status,'VIAVEL');assert.equal(decision.origin,'LIVE');
  const failed=decide(request,ixc,{...sheet,complete:false},[],{maxDistanceMeters:500,maxUpdateAgeDays:null,freshnessMode:'CURRENT_SNAPSHOT',version:'live-current-snapshot-v1',regionalCoverageConfirmed:true},new Date());
  assert.equal(failed.status,'ANALISE_TECNICA');
});

test('runtime aceita dominio IXC e confirma o mapa regional aprovado pelo usuario',async()=>{
  const {createLiveRuntime}=await import('../../.test-build/viabilidade/runtime.js');
  const runtime=createLiveRuntime({IXC_DOMAIN:'ixc.example.com',IXC_TOKEN:'1:fixture',VIABILITY_LIVE_ENABLED:'true',VIABILITY_FRESHNESS_MODE:'CURRENT_SNAPSHOT'});
  assert.equal(runtime.enabled,true);assert.equal(runtime.policy.regionalCoverageConfirmed,true);assert.equal(runtime.policy.freshnessMode,'CURRENT_SNAPSHOT');
  const fiberDocs=runtime.sourceStatus.sources.find(source=>source.name==='FiberDocs');
  assert.equal(typeof runtime.network,'function');
  assert.match(fiberDocs?.state??'',/postes e cabos/i);
  assert.ok(!runtime.sourceStatus.blockers.includes('CONFIRMAR_TRAJETO'));
  assert.match(runtime.sourceStatus.sources.find(source=>source.name==='Trajeto de instalação')?.state??'',/automaticamente/i);
  const legacyOverride=createLiveRuntime({IXC_DOMAIN:'ixc.example.com',IXC_TOKEN:'1:fixture',VIABILITY_IXC_SELECTORS_JSON:JSON.stringify({AC:{field:'id_projeto',values:['1','3']},CP:{field:'id_projeto',values:['2','21']}})});
  assert.equal(legacyOverride.policy.regionalCoverageConfirmed,true);
  const customOverride=createLiveRuntime({IXC_DOMAIN:'ixc.example.com',IXC_TOKEN:'1:fixture',VIABILITY_IXC_SELECTORS_JSON:JSON.stringify({AC:{field:'id_cidade',values:['10']},CP:{field:'id_cidade',values:['20']}})});
  assert.equal(customOverride.policy.regionalCoverageConfirmed,false);
  const confirmedOverride=createLiveRuntime({IXC_DOMAIN:'ixc.example.com',IXC_TOKEN:'1:fixture',VIABILITY_IXC_SELECTORS_JSON:JSON.stringify({AC:{field:'id_cidade',values:['10']},CP:{field:'id_cidade',values:['20']}}),VIABILITY_REGIONAL_COVERAGE_CONFIRMED:'true'});
  assert.equal(confirmedOverride.policy.regionalCoverageConfirmed,true);
});

test('runtime consulta todos os projetos FiberDocs confirmados em AC e CP',async()=>{
  const {createLiveRuntime}=await import('../../.test-build/viabilidade/runtime.js');
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url:String(url),body:JSON.parse(options.body)});
    return Response.json({page:'1',total:'0',registros:[]});
  };
  const runtime=createLiveRuntime({IXC_DOMAIN:'ixc.example.com',IXC_TOKEN:'1:fixture',VIABILITY_LIVE_ENABLED:'true'},fetcher);
  await runtime.sources.loadIxc('AC');
  await runtime.sources.loadIxc('CP');
  assert.equal(calls.length,2);
  assert.deepEqual(JSON.parse(calls[0].body.grid_param)[0],{TB:'rad_caixa_ftth.id_projeto',OP:'IN',P:'1,3,4,5,6,7,8,9,10,11,12,13,14,16,17,18,19,20'});
  assert.deepEqual(JSON.parse(calls[1].body.grid_param)[0],{TB:'rad_caixa_ftth.id_projeto',OP:'IN',P:'2,21'});
  const legacyRuntime=createLiveRuntime({IXC_DOMAIN:'ixc.example.com',IXC_TOKEN:'1:fixture',VIABILITY_IXC_SELECTORS_JSON:JSON.stringify({AC:{field:'id_projeto',values:['1','3']},CP:{field:'id_projeto',values:['2','21']}})},fetcher);
  await legacyRuntime.sources.loadIxc('AC');
  assert.deepEqual(JSON.parse(calls[2].body.grid_param)[0],{TB:'rad_caixa_ftth.id_projeto',OP:'IN',P:'1,3,4,5,6,7,8,9,10,11,12,13,14,16,17,18,19,20'});
});

test('runtime do painel usa a credencial IXC existente e conserva fallback de ambiente sem expor segredos',async()=>{
  const {createPanelLiveRuntime}=await import('../../.test-build/viabilidade/runtime.js');
  const env={IXC_DOMAIN:'ixc.example.com',IXC_TOKEN:'invalid-env',VIABILITY_LIVE_ENABLED:'true'};
  const resolved=await createPanelLiveRuntime(env,async()=>({hasCredentials:true,cleanDomain:'ixc.example.com',token:'1:fixture'}));
  assert.equal(resolved.enabled,true);assert.equal(env.IXC_TOKEN,'invalid-env');
  assert.equal(JSON.stringify(resolved.sourceStatus).includes('fixture'),false);
  const fallback=await createPanelLiveRuntime({...env,IXC_TOKEN:'1:fixture'},async()=>({hasCredentials:false,cleanDomain:'',token:''}));
  assert.equal(fallback.enabled,true);
  let calls=0;const disabled=await createPanelLiveRuntime({...env,VIABILITY_LIVE_ENABLED:'false'},async()=>{calls++;throw Error('unused')});
  assert.equal(disabled.enabled,false);assert.equal(calls,0);
});

test('CTO CP reconhece o prefixo real, ignora anotacao historica de vagas e recusa prefixo de outra regiao',async()=>{
  const {canonicalKey}=await import('../../.test-build/viabilidade/domain/normalize.js');
  assert.equal(canonicalKey('CP','CP-CTO N04'),'CP:4');
  assert.equal(canonicalKey('CP','CP-CTO N02 = V2-29/08/24'),'CP:2');
  assert.equal(canonicalKey('CP','N026-1x8 LUZ -15.38 PON 1005'),'CP:26');
  assert.equal(canonicalKey('CP','N031-1x16=19.05DB - PON 1005'),'CP:31');
  assert.equal(canonicalKey('AC','CP-CTO N04'),null);assert.equal(canonicalKey('CP','AC-CTO N04'),null);
  assert.equal(canonicalKey('CP','CP-CTO N04 outro setor'),null);
});

test('data textual apenas informativa nao bloqueia snapshot atual mas bloqueia politica por data',async()=>{
  const {decide}=await import('../../.test-build/viabilidade/domain/decide.js');
  const {parseSheetRows}=await import('../../.test-build/viabilidade/domain/normalize.js');
  const rows=parseSheetRows('CP',[['gente','SPLITT','','VAGAS','PON','','','','','DATA'],['N-01','1X16','','3','1015','','-1.1, -47.1','','','data informativa']]);
  const now=new Date();const point={latitude:-1.1,longitude:-47.1};
  const ixc={rows:[{id:'1',originalName:'CP-CTO N01',region:'CP',active:true,capacity:16,location:point}],origin:'LIVE',complete:true,fetchedAt:now.toISOString(),issues:[]};
  const sheet={...ixc,rows};const request={region:'CP',location:point};
  const routes=[{ctoId:'1',location:point,meters:300,confirmedAt:now.toISOString(),reference:'medicao-controlada'}];
  const policy={maxDistanceMeters:500,maxUpdateAgeDays:null,freshnessMode:'CURRENT_SNAPSHOT',version:'test',regionalCoverageConfirmed:true};
  assert.equal(decide(request,ixc,sheet,routes,policy,now).status,'VIAVEL');
  assert.equal(decide(request,ixc,sheet,routes,{...policy,maxUpdateAgeDays:30,freshnessMode:'ROW_DATE'},now).status,'ANALISE_TECNICA');
});
