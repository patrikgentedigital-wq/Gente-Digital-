import {test,expect} from '@playwright/test';

test('mapa de ruas desenha cabos e mostra a rota estimada pela geometria FiberDocs',async({page})=>{
  const tileRequests:string[]=[];
  let decisionPosts=0,networkReads=0;
  await page.route('https://tile.openstreetmap.org/**',async route=>{
    tileRequests.push(route.request().url());
    await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eef2"/><path d="M-20 80 270 145M20 -20 210 280M-20 210 280 40" stroke="#fff" stroke-width="12"/><path d="M-20 80 270 145M20 -20 210 280M-20 210 280 40" stroke="#cbd5e1" stroke-width="1"/></svg>'});
  });
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'LIVE',enabled:true,productionReady:false,sources:[],audit:{}})}));
  const network={poles:[{id:'pole-1',name:'Poste fixture',location:{latitude:-1.1004,longitude:-47.1004}}],cables:[{id:'cable-1',name:'Cabo fixture',points:[{latitude:-1.101,longitude:-47.101},{latitude:-1.1004,longitude:-47.1004},{latitude:-1.1,longitude:-47.1}]}],cableCount:1,complete:true,issues:[],fetchedAt:new Date().toISOString()};
  await page.route('**/api/viabilidade',route=>{if(route.request().method()==='POST')decisionPosts++;return route.fulfill({contentType:'application/json',body:JSON.stringify({id:'fixture-map',evaluatedAt:new Date().toISOString(),origin:'LIVE',status:'ANALISE_TECNICA',recommendedCtoId:'cto-1',candidates:[{ctoId:'cto-1',status:'ANALISE_TECNICA',geographicMeters:157,routeMeters:177,routeSource:'FIBERDOCS_ESTIMATE',routeComponents:{lineMeters:157,installAccessMeters:0,ctoAccessMeters:0,reserveMeters:20,totalMeters:177},available:2,ixcCapacity:8,sheetCapacity:8,updatedOn:null,sheet:null,row:null,reasons:['TRAJETO_ESTIMADO_FIBERDOCS']}],reasons:['CANDIDATA_COM_DADOS_INSUFICIENTES'],routeGeometries:[{ctoId:'cto-1',source:'FIBERDOCS_ESTIMATE',points:[{latitude:-1.101,longitude:-47.101},{latitude:-1.1004,longitude:-47.1004},{latitude:-1.1,longitude:-47.1}]}],network})});});
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({rows:[
    {id:'cto-1',name:'AC-CTO N01',location:{latitude:-1.101,longitude:-47.101}},
    {id:'cto-2',name:'AC-CTO N02',location:{latitude:-1.102,longitude:-47.102}}
  ]})}));
  await page.route('**/api/viabilidade?view=network*',route=>{networkReads++;return route.fulfill({contentType:'application/json',body:JSON.stringify(network)});});
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mapa de ruas e CTOs',exact:true})).toBeVisible();
  await expect(page.getByText('Raio geográfico: 500 m',{exact:true})).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon[title="Ponto de instalação"]')).toHaveCount(1);
  await expect(page.locator('.leaflet-marker-icon[title*="AC-CTO N01"]')).toHaveCount(1);
  await expect(page.getByText('1 poste com coordenada · 1 de 1 cabo com geometria.')).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane svg path[fill="none"]')).toHaveCount(2);
  await expect(page.getByText(/Rota FiberDocs estimada: \d+ m/)).toBeVisible();
  await page.locator('.leaflet-marker-icon[title*="AC-CTO N01"]').click();
  await expect(page.getByText('157 m em linha reta',{exact:true})).toBeVisible();
  await expect(page.getByText(/A rota e a metragem vêm do mesmo cálculo no servidor/)).toBeVisible();
  await expect(page.getByRole('link',{name:/OpenStreetMap contributors/})).toBeVisible();
  await expect(page.getByText(/provedor do mapa recebe a área aproximada exibida/)).toBeVisible();
  await page.getByRole('button',{name:'Fontes e pendências'}).click();
  await page.getByRole('button',{name:'Atualizar FiberDocs (AC)'}).click();
  await expect(page.getByText(/1 poste com coordenada · 1 de 1 cabo com geometria · leitura completa/)).toBeVisible();
  expect(networkReads).toBe(1);
  expect(decisionPosts).toBe(1);
  await page.getByRole('button',{name:'Consultar',exact:true}).click();
  await expect(page.getByText(/Rota FiberDocs estimada: \d+ m/)).toBeVisible();
  await expect.poll(()=>tileRequests.length).toBeGreaterThan(0);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(tileRequests.every(url=>/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url))).toBe(true);
  await page.screenshot({path:'output/playwright/viabilidade-map.png',fullPage:true});
});

test('o mapa inclui a CTO recomendada mesmo fora das dez mais próximas',async({page})=>{
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({json:{mode:'LIVE',enabled:true,productionReady:false,sources:[],audit:{}}}));
  const rows=Array.from({length:12},(_,index)=>({id:`cto-${index+1}`,name:`CTO ${index+1}`,region:'CP',active:true,location:{latitude:-1.1+index*0.00001,longitude:-47.1}}));
  await page.route('**/api/viabilidade',route=>route.fulfill({json:{id:'fixture-recommended',evaluatedAt:new Date().toISOString(),origin:'LIVE',status:'VIAVEL',recommendedCtoId:'cto-12',candidates:[{ctoId:'cto-12',status:'VIAVEL',geographicMeters:12,routeMeters:20,routeSource:'FIBERDOCS_ESTIMATE',available:3,ixcCapacity:8,sheetCapacity:8,updatedOn:'2026-10-06',sheet:null,row:null,reasons:['TRAJETO_ESTIMADO_FIBERDOCS']}],reasons:[],network:{poles:[],cables:[],cableCount:0,complete:true,issues:[],fetchedAt:new Date().toISOString()}}}));
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({json:{rows}}));
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.locator('.leaflet-marker-icon[title*="CTO 12"][title*="recomendada pela análise"]')).toHaveCount(1);
});

test('rota OSM enviada pelo servidor aparece com origem, total e reserva sem aprovar a CTO',async({page})=>{
  const updatedAt='2026-10-07T14:30:29Z';
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({json:{mode:'LIVE',enabled:true,productionReady:false,sources:[]}}));
  await page.route('**/api/viabilidade',route=>route.request().method()==='POST'
    ?route.fulfill({json:{id:'fixture-osm',evaluatedAt:updatedAt,origin:'LIVE',status:'ANALISE_TECNICA',recommendedCtoId:null,
      sources:{ixcFetchedAt:updatedAt,sheetsFetchedAt:updatedAt,roadGraphVersion:'0123456789abcdefabcd',roadGraphUpdatedAt:updatedAt},
      candidates:[{ctoId:'cto-osm',status:'ANALISE_TECNICA',geographicMeters:157,routeMeters:127,routeSource:'OSM_ESTIMATE',
        routeComponents:{lineMeters:100,installAccessMeters:4,ctoAccessMeters:3,reserveMeters:20,totalMeters:127},available:2,ixcCapacity:8,sheetCapacity:8,updatedOn:null,sheet:null,row:null,reasons:['TRAJETO_ESTIMADO_OSM']}],
      reasons:['CANDIDATA_COM_DADOS_INSUFICIENTES'],routeGeometries:[{ctoId:'cto-osm',source:'OSM_ESTIMATE',points:[
        {latitude:-1.1,longitude:-47.1},{latitude:-1.1005,longitude:-47.1002},{latitude:-1.101,longitude:-47.101}]}]}})
    :route.continue());
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({json:{rows:[
    {id:'cto-osm',name:'CTO OSM',location:{latitude:-1.101,longitude:-47.101}}
  ]}}));
  await page.route('**/api/viabilidade?view=network*',route=>route.fulfill({json:{poles:[],cables:[],cableCount:0,complete:true,issues:[],fetchedAt:updatedAt}}));
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Análise técnica',exact:false})).toBeVisible();
  await expect(page.getByText(/Rota estimada pelas ruas OSM: 127 m/)).toBeVisible();
  await expect(page.getByText('Reserva',{exact:true})).toBeVisible();
  await expect(page.getByText('20 m',{exact:true})).toBeVisible();
  await expect(page.getByText(/OpenStreetMap/).first()).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path[fill="none"]')).toHaveCount(1);
  await expect(page.getByRole('link',{name:'Atribuição OSM'})).toBeVisible();
  await expect(page.getByText(/não comprova cabo/i)).toBeVisible();
});

test('mantém a escolha manual na consulta atual e volta à CTO recomendada na próxima consulta',async({page})=>{
  let evaluations=0;
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({json:{mode:'LIVE',enabled:true,productionReady:false,sources:[]}}));
  await page.route('**/api/viabilidade',route=>route.request().method()==='POST'
    ?(evaluations++,route.fulfill({json:{id:`fixture-selection-${evaluations}`,evaluatedAt:new Date().toISOString(),origin:'LIVE',status:'ANALISE_TECNICA',recommendedCtoId:'cto-1',sources:{roadGraphUpdatedAt:new Date().toISOString()},
      candidates:[
        {ctoId:'cto-1',status:'ANALISE_TECNICA',geographicMeters:157,routeMeters:127,routeSource:'OSM_ESTIMATE',routeComponents:{lineMeters:100,installAccessMeters:4,ctoAccessMeters:3,reserveMeters:20,totalMeters:127},available:2,ixcCapacity:8,sheetCapacity:8,updatedOn:null,sheet:null,row:null,reasons:['TRAJETO_ESTIMADO_OSM']},
        {ctoId:'cto-2',status:'ANALISE_TECNICA',geographicMeters:220,routeMeters:227,routeSource:'OSM_ESTIMATE',routeComponents:{lineMeters:200,installAccessMeters:4,ctoAccessMeters:3,reserveMeters:20,totalMeters:227},available:2,ixcCapacity:8,sheetCapacity:8,updatedOn:null,sheet:null,row:null,reasons:['TRAJETO_ESTIMADO_OSM']}
      ],reasons:['CANDIDATA_COM_DADOS_INSUFICIENTES'],
      routeGeometries:[
        {ctoId:'cto-1',source:'OSM_ESTIMATE',points:[{latitude:-1.1,longitude:-47.1},{latitude:-1.101,longitude:-47.101}]},
        {ctoId:'cto-2',source:'OSM_ESTIMATE',points:[{latitude:-1.1,longitude:-47.1},{latitude:-1.102,longitude:-47.1}]}
      ]}}))
    :route.continue());
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({json:{rows:[
    {id:'cto-1',name:'CTO 1',location:{latitude:-1.101,longitude:-47.101}},
    {id:'cto-2',name:'CTO 2',location:{latitude:-1.102,longitude:-47.1}}
  ]}}));
  await page.route('**/api/viabilidade?view=network*',route=>route.fulfill({json:{poles:[],cables:[],cableCount:0,complete:true,issues:[],fetchedAt:new Date().toISOString()}}));
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');
  await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  const routeChoice=page.getByLabel('CTO para rota');
  await expect(routeChoice).toHaveValue('cto-1');
  await routeChoice.selectOption('cto-2');
  await expect(page.getByText(/Rota estimada pelas ruas OSM: 227 m/)).toBeVisible();
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect.poll(()=>evaluations).toBe(2);
  await expect(routeChoice).toHaveValue('cto-1');
  await expect(page.getByText(/Rota estimada pelas ruas OSM: 127 m/)).toBeVisible();
});
