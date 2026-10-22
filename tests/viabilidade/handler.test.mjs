import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSources } from '../../.test-build/viabilidade/adapters/demo.js';

async function fixture(changes={}) {
  const {createViabilityHandler}=await import('../../.test-build/viabilidade/handler.js');
  const saved=[];
  const handler=createViabilityHandler({enabled:true,authenticate:async()=>({id:'test-user'}),
    authorizeLead:async()=>true,sources:createDemoSources(),
    save:async(d,lead,user)=>{saved.push({...d,leadId:lead,actorId:user.id})},history:async()=>[],
    ...changes});
  return {handler,saved};
}
const url='http://localhost:3000/api/viabilidade';
function post(body,headers={}){return new Request(url,{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)})}
const point={region:'AC',latitude:12.345,longitude:45.678};
test('API centralizada autentica antes de consultar fontes e recusa CSRF',async()=>{
  const {handler}=await fixture({authenticate:async()=>null});assert.equal((await handler(new Request(url))).status,401);
  const allowed=await fixture();assert.equal((await allowed.handler(post(point,{origin:'https://external.invalid'}))).status,403);
});

test('CSRF compara origem externa com Host do proxy sem confundir hostname interno do Next',async()=>{
  const {handler}=await fixture();
  const r=await handler(new Request('http://localhost:3020/api/viabilidade',{
    method:'POST',headers:{host:'127.0.0.1:3020',origin:'http://127.0.0.1:3020','content-type':'application/json'},body:JSON.stringify(point)
  }));
  assert.equal(r.status,200);
});
test('API centralizada retorna tres cenarios reais do motor DEMO e persiste somente apos decidir',async()=>{
  const {handler,saved}=await fixture();
  for(const [latitude,status] of [[12.345,'VIAVEL'],[12.355,'INVIAVEL'],[12.3452,'ANALISE_TECNICA']]){
    const r=await handler(post({...point,latitude}));assert.equal(r.status,200);
    const body=await r.json();assert.equal(body.status,status);assert.equal(body.origin,'DEMO');
  }
  assert.equal(saved.length,3);assert.equal(saved[0].region,'AC');
});
test('lead precisa ser acessivel; nao aceita prova, identidade ou payload excedente do cliente',async()=>{
  const {handler,saved}=await fixture({authorizeLead:async()=>false});
  assert.equal((await handler(post({...point,leadId:8}))).status,403);
  assert.equal((await handler(post({...point,actorId:'admin'}))).status,400);
  assert.equal((await handler(post('x'.repeat(17000)))).status,413);
  assert.equal(saved.length,0);
  const allowed=await fixture();const r=await allowed.handler(post({...point,leadId:8}));assert.equal(r.status,200);
  assert.equal(allowed.saved[0].leadId,8);assert.equal(allowed.saved[0].actorId,'test-user');
});
test('tamanho declarado acima do limite e recusado antes de carregar o corpo',async()=>{
  const {handler}=await fixture();const request=post(point,{'content-length':'17000'});let bodyRead=false;
  request.text=async()=>{bodyRead=true;return JSON.stringify(point)};
  const response=await handler(request);
  assert.equal(response.status,413);assert.equal(bodyRead,false);
});
test('corpo transmitido acima do limite e cancelado sem leitura completa',async()=>{
  const {handler}=await fixture();let cancelled=false;let controllerRef;
  const body=new ReadableStream({start(controller){controllerRef=controller;controller.enqueue(new Uint8Array(17000));setTimeout(()=>{try{controller.close()}catch{}},0)},cancel(){cancelled=true}});
  const request=new Request(url,{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body,duplex:'half'});
  const response=await handler(request);
  assert.equal(response.status,413);assert.equal(cancelled,true);
});
test('fontes indisponiveis e falha de persistencia nunca devolvem aprovacao comercial',async()=>{
  const disabled=await fixture({enabled:false});assert.equal((await disabled.handler(post(point))).status,503);
  const state=await disabled.handler(new Request(url+'?view=status'));assert.equal((await state.json()).productionReady,false);
  const failed=await fixture({save:async()=>{throw Error('PRIVATE FAILURE')}});
  const r=await failed.handler(post(point));assert.equal(r.status,503);assert.equal((await r.text()).includes('PRIVATE'),false);
});

test('diagnóstico operacional exige sessão e executa somente a leitura das fontes',async()=>{
  let reads=0;
  const data={checkedAt:'2026-10-06T18:00:00.000Z',regions:{AC:{},CP:{}}};
  const {handler}=await fixture({origin:'LIVE',diagnostics:async()=>{reads++;return data}});
  const unauthorized=await fixture({authenticate:async()=>null,diagnostics:async()=>{reads++;return data}});
  assert.equal((await unauthorized.handler(new Request(url+'?view=diagnostics'))).status,401);
  assert.equal(reads,0);
  const response=await handler(new Request(url+'?view=diagnostics'));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),data);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(reads,1);
});
