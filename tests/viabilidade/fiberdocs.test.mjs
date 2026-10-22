import test from 'node:test';
import assert from 'node:assert/strict';

test('FiberDocs junta coordenadas do recurso separado e preserva a ordem dos vertices',async()=>{
  const {createFiberDocsSource}=await import('../../.test-build/viabilidade/adapters/fiberdocs.js');
  const calls=[];
  const source=createFiberDocsSource({baseUrl:'https://ixc.example.com',token:'1:fixture',projects:{AC:['1'],CP:['2']},pageSize:1},async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({url:String(url),body});
    assert.equal(init.headers.ixcsoft,'listar');assert.equal(init.redirect,'error');
    if(String(url).endsWith('/df_elemento_coordenada')){
      const records=[
        {id:'101',id_elemento:'1',latitude:'-1.1',longitude:'-47.1',ordem:'1',observacao:'privado'},
        {id:'102',id_elemento:'2',latitude:'-1.4',longitude:'-47.4',ordem:'1'},
        {id:'103',id_elemento:'3',latitude:'-1.3',longitude:'-47.3',ordem:'2'},
        {id:'104',id_elemento:'3',latitude:'-1.2',longitude:'-47.2',ordem:'1'}
      ];
      const page=Number(body.page);return Response.json({page:String(page),total:String(records.length),registros:records.slice((page-1),page)});
    }
    const row=body.query==='PT'?{id:body.page,id_projeto:'1',tipo:'PT',descricao:'Poste '+body.page,observacao:'privado'}:{id:'3',id_projeto:'1',tipo:'CB',descricao:'Cabo',comprimento:'900',observacao:'privado'};
    return Response.json({page:body.page,total:body.query==='PT'?'2':'1',registros:[row]});
  });
  const snapshot=await source('AC');
  assert.equal(snapshot.complete,true);assert.equal(snapshot.poles.length,2);assert.equal(snapshot.cableCount,1);
  assert.deepEqual(snapshot.poles[0].location,{latitude:-1.1,longitude:-47.1});
  assert.equal(snapshot.cables.length,1);assert.deepEqual(snapshot.cables[0].points,[
    {latitude:-1.2,longitude:-47.2},{latitude:-1.3,longitude:-47.3}
  ]);
  assert.equal(snapshot.issues.includes('CABO_GEOMETRIA_PENDENTE'),false);
  assert.equal(calls.length,7);
  assert.ok(calls.filter(c=>c.url.endsWith('/df_elemento')).every(c=>c.body.grid_param.includes('df_elemento.id_projeto')));
  assert.ok(calls.filter(c=>c.url.endsWith('/df_elemento_coordenada')).every(c=>c.body.qtype==='df_elemento_coordenada.id_elemento'&&c.body.oper==='IN'));
  assert.equal(JSON.stringify(snapshot).includes('privado'),false);assert.equal(JSON.stringify(snapshot).includes('fixture'),false);
});

test('FiberDocs resolve id_coordenada pela tabela de pontos e ordena pela sequencia do elemento',async()=>{
  const {createFiberDocsSource}=await import('../../.test-build/viabilidade/adapters/fiberdocs.js');
  const calls=[];
  const source=createFiberDocsSource({baseUrl:'https://ixc.example.com',token:'1:fixture',projects:{AC:['1'],CP:['2']}},async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({url:String(url),body});
    if(String(url).endsWith('/df_elemento_coordenada'))return Response.json({page:body.page,total:'2',registros:[
      {id:'10',id_elemento:'3',id_coordenada:'202',sequencia:'2',ultima_atualizacao:'private'},
      {id:'11',id_elemento:'3',id_coordenada:'201',sequencia:'1',ultima_atualizacao:'private'}
    ]});
    if(String(url).endsWith('/df_coordenada'))return Response.json({page:body.page,total:'2',registros:[
      {id:'201',latitude:'-1.2',longitude:'-47.2',observacao:'nao vazar'},
      {id:'202',latitude:'-1.3',longitude:'-47.3',observacao:'nao vazar'}
    ]});
    const registros=body.query==='PT'?[]:[{id:'3',id_projeto:'1',tipo:'CB'}];
    return Response.json({page:'1',total:String(registros.length),registros});
  });
  const snapshot=await source('AC');
  assert.equal(snapshot.complete,true);assert.equal(snapshot.cableCount,1);
  assert.deepEqual(snapshot.cables[0].points,[{latitude:-1.2,longitude:-47.2},{latitude:-1.3,longitude:-47.3}]);
  assert.ok(calls.some(call=>call.url.endsWith('/df_coordenada')&&call.body.qtype==='df_coordenada.id'&&call.body.oper==='IN'));
  assert.equal(JSON.stringify(snapshot).includes('nao vazar'),false);
});

test('FiberDocs recusa projeto fora do escopo e paginacao truncada',async()=>{
  const {createFiberDocsSource}=await import('../../.test-build/viabilidade/adapters/fiberdocs.js');
  for(const registros of [[{id:'1',id_projeto:'2',tipo:'PT',descricao:'Poste',latitude:'-1',longitude:'-47'}],[]]){
    const source=createFiberDocsSource({baseUrl:'https://ixc.example.com',token:'1:fixture',projects:{AC:['1'],CP:['2']}},async()=>Response.json({page:'1',total:'1',registros}));
    const result=await source('AC');assert.equal(result.complete,false);assert.equal(result.poles.length,0);
  }
});

test('FiberDocs marca a rede parcial quando a tabela de coordenadas falha',async()=>{
  const {createFiberDocsSource}=await import('../../.test-build/viabilidade/adapters/fiberdocs.js');
  const source=createFiberDocsSource({baseUrl:'https://ixc.example.com',token:'1:fixture',projects:{AC:['1'],CP:['2']}},async(url,init)=>{
    if(String(url).endsWith('/df_elemento_coordenada'))return new Response(null,{status:403});
    const body=JSON.parse(init.body);
    const row=body.query==='PT'?{id:'1',id_projeto:'1',tipo:'PT'}:{id:'2',id_projeto:'1',tipo:'CB'};
    return Response.json({page:'1',total:'1',registros:[row]});
  });
  const snapshot=await source('AC');
  assert.equal(snapshot.complete,false);assert.equal(snapshot.cableCount,1);assert.deepEqual(snapshot.cables,[]);
  assert.ok(snapshot.issues.includes('FIBERDOCS_COORDENADAS_INDISPONIVEIS'));
  assert.ok(snapshot.issues.includes('FIBERDOCS_COORDINATES_HTTP_403'));
});

test('diagnostico de esquema devolve somente nomes de campo, nunca valores das coordenadas',async()=>{
  const {createFiberDocsSource}=await import('../../.test-build/viabilidade/adapters/fiberdocs.js');
  const source=createFiberDocsSource({baseUrl:'https://ixc.example.com',token:'1:fixture',projects:{AC:['1'],CP:['2']}},async(url,init)=>{
    const body=JSON.parse(init.body);
    if(String(url).endsWith('/df_elemento_coordenada'))return Response.json({page:'1',total:'1',registros:[{id:'100',id_elemento_fk:'3',lat_pos:'-1.2345',lon_pos:'-47.1234',ordem:'1',observacao:'privado'}]});
    const registros=body.query==='PT'?[]:[{id:'3',id_projeto:'1',tipo:'CB'}];
    return Response.json({page:'1',total:String(registros.length),registros});
  });
  const snapshot=await source('AC');
  assert.deepEqual(snapshot.diagnostics?.coordinateFields,['id','id_elemento_fk','lat_pos','lon_pos','observacao','ordem']);
  assert.equal(JSON.stringify(snapshot).includes('-1.2345'),false);
  assert.equal(JSON.stringify(snapshot).includes('privado'),false);
});

test('diagnostico FiberDocs explica recusas e formatos sem expor dados do IXC',async()=>{
  const {describeFiberDocsIssue,describeFiberDocsIssues}=await import('../../.test-build/viabilidade/fiberdocs-issues.js');
  assert.match(describeFiberDocsIssue('FIBERDOCS_COORDINATES_HTTP_403'),/permissão Webservice/);
  assert.match(describeFiberDocsIssue('FIBERDOCS_COORDINATES_HTTP_400'),/filtro da tabela/);
  assert.match(describeFiberDocsIssue('FIBERDOCS_COORDINATES_ROW_SHAPE_INVALID'),/campos das coordenadas/);
  assert.equal(describeFiberDocsIssue('FIBERDOCS_COORDINATES_HTTP_422'),null);
  assert.equal(describeFiberDocsIssues(['CABO_GEOMETRIA_PENDENTE','CABO_GEOMETRIA_PENDENTE']).length,1);
});

test('FiberDocs nao cria linha com vertices ausentes ou fora dos limites',async()=>{
  const {createFiberDocsSource}=await import('../../.test-build/viabilidade/adapters/fiberdocs.js');
  const source=createFiberDocsSource({baseUrl:'https://ixc.example.com',token:'1:fixture',projects:{AC:['1'],CP:['2']}},async(_url,init)=>{
    const body=JSON.parse(init.body);
    if(body.qtype==='df_elemento_coordenada.id_elemento')return Response.json({page:body.page,total:'0',registros:[]});
    const registros=body.query==='PT'?[]:[
      {id:'10',id_projeto:'1',tipo:'CB',descricao:'Sem vertices suficientes',coordenadas:[['-1.2','-47.2']]},
      {id:'11',id_projeto:'1',tipo:'CB',descricao:'Coordenada invalida',coordenadas:[['91','-47.2'],['-1.3','-47.3']]}
    ];
    return Response.json({page:'1',total:String(registros.length),registros});
  });
  const snapshot=await source('AC');
  assert.equal(snapshot.complete,false);assert.equal(snapshot.cableCount,2);assert.deepEqual(snapshot.cables,[]);
  assert.ok(snapshot.issues.includes('CABO_GEOMETRIA_PENDENTE'));
});

test('FiberDocs identifica os cabos sem geometria para corrigir o cadastro de origem',async()=>{
  const {createFiberDocsSource}=await import('../../.test-build/viabilidade/adapters/fiberdocs.js');
  const source=createFiberDocsSource({baseUrl:'https://ixc.example.com',token:'1:fixture',projects:{AC:['1'],CP:['2']}},async(_url,init)=>{
    const body=JSON.parse(init.body);
    const registros=body.query==='PT'?[]:[
      {id:'10',id_projeto:'1',tipo:'CB',descricao:'Cabo com geometria',coordenadas:[['-1.2','-47.2'],['-1.3','-47.3']]},
      {id:'11',id_projeto:'1',tipo:'CB',descricao:'Cabo aguardando pontos'}
    ];
    return Response.json({page:'1',total:String(registros.length),registros});
  });
  const snapshot=await source('AC');
  assert.equal(snapshot.complete,false);
  assert.equal(snapshot.cableCount,2);
  assert.deepEqual(snapshot.diagnostics?.missingCables,[{id:'11',name:'Cabo aguardando pontos'}]);
});

test('estimativa segue vertices do cabo e nao conecta cabos apenas proximos',async()=>{
  const {estimateCablePath}=await import('../../.test-build/viabilidade/domain/network-path.js');
  const a={latitude:0,longitude:0},b={latitude:0.001,longitude:0},c={latitude:0.001,longitude:0.001};
  const cables=[{id:'c1',name:'Cabo',points:[a,b,c]}];
  const route=estimateCablePath(cables,a,c);
  assert.ok(route.meters>220&&route.meters<225);assert.equal(route.points.length,3);assert.equal(route.confirmed,false);
  assert.equal(estimateCablePath([{id:'a',name:'A',points:[a,b]},{id:'b',name:'B',points:[{latitude:0.00101,longitude:0},c]}],a,c),null);
  assert.equal(estimateCablePath(cables,a,{latitude:0.02,longitude:0.02}),null);
});

test('metragem usa a projeção no segmento e soma os acessos aos dois extremos',async()=>{
  const {estimateCablePath}=await import('../../.test-build/viabilidade/domain/network-path.js');
  const cable=[{id:'c1',name:'Cabo',points:[{latitude:0,longitude:0},{latitude:0,longitude:0.001}]}];
  const start={latitude:0.00005,longitude:0.0002};
  const end={latitude:0.00005,longitude:0.0008};
  const route=estimateCablePath(cable,start,end);
  assert.ok(route);
  assert.ok(route.meters>77&&route.meters<79);
  assert.ok(route.startGap>5&&route.startGap<6);
  assert.ok(route.endGap>5&&route.endGap<6);
  assert.deepEqual(route.points[0],start);
  assert.deepEqual(route.points.at(-1),end);
});

test('poste compartilhado conecta cabos com pequena diferença nas coordenadas de junção',async()=>{
  const {estimateCablePath}=await import('../../.test-build/viabilidade/domain/network-path.js');
  const poles=[{id:'p1',name:'Poste',location:{latitude:0,longitude:0.001}}];
  const cables=[
    {id:'c1',name:'Cabo 1',points:[{latitude:0,longitude:0},{latitude:0,longitude:0.00099}]},
    {id:'c2',name:'Cabo 2',points:[{latitude:0,longitude:0.00101},{latitude:0,longitude:0.002}]},
  ];
  const route=estimateCablePath(cables,{latitude:0,longitude:0},{latitude:0,longitude:0.002},poles);
  assert.ok(route);
  assert.ok(route.meters>222&&route.meters<224);
});

test('cruzamento de vertices internos nao conecta cabos sem um poste cadastrado',async()=>{
  const {estimateCablePath}=await import('../../.test-build/viabilidade/domain/network-path.js');
  const cables=[
    {id:'vertical',name:'Vertical',points:[{latitude:-0.001,longitude:0},{latitude:0,longitude:0},{latitude:0.001,longitude:0}]},
    {id:'horizontal',name:'Horizontal',points:[{latitude:0,longitude:-0.001},{latitude:0,longitude:0},{latitude:0,longitude:0.001}]},
  ];
  assert.equal(estimateCablePath(cables,{latitude:-0.001,longitude:0},{latitude:0,longitude:0.001}),null);
});

test('rede FiberDocs exige autenticacao antes da leitura e regiao explicita',async()=>{
  const {createViabilityHandler}=await import('../../.test-build/viabilidade/handler.js');
  const {createDemoSources}=await import('../../.test-build/viabilidade/adapters/demo.js');
  let reads=0;
  const deps={enabled:true,origin:'LIVE',sources:createDemoSources(),authenticate:async()=>null,authorizeLead:async()=>true,save:async()=>{},history:async()=>[],network:async()=>{reads++;return {poles:[],cables:[],cableCount:0,complete:true,issues:[],fetchedAt:new Date().toISOString()};}};
  const request=region=>new Request('https://panel.example/api/viabilidade?view=network&region='+region);
  assert.equal((await createViabilityHandler(deps)(request('AC'))).status,401);assert.equal(reads,0);
  const handler=createViabilityHandler({...deps,authenticate:async()=>({id:'user'})});
  assert.equal((await handler(request('OUTRA'))).status,400);assert.equal(reads,0);
  const response=await handler(request('AC'));assert.equal(response.status,200);assert.equal(reads,1);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).complete,true);
});
