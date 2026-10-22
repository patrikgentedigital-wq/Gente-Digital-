import {test,expect} from '@playwright/test';

test('fontes reais mostram consulta operacional e ocultam os cenarios ficticios',async({page})=>{
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'LIVE',enabled:true,productionReady:false,sources:[],audit:{asOf:'2026-10-06',ambiguousAcKeys:102,missingCoordinates:639,invalidVacancies:110,aboveCapacity:10}})}));
  await page.route('**/api/viabilidade',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id:'00000000-0000-4000-8000-000000000001',evaluatedAt:new Date().toISOString(),origin:'LIVE',status:'ANALISE_TECNICA',recommendedCtoId:null,candidates:[],reasons:['TRAJETO_NAO_CONFIRMADO']})}));
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({contentType:'application/json',body:'{"rows":[]}'}));
  await page.goto('/?tab=viabilidade');
  await expect(page.getByText('Consulta às fontes reais',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Com vaga',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Análise técnica',exact:true})).toBeVisible();
  await expect(page.getByText('na demonstração',{exact:true})).toHaveCount(0);
});

test('volume real de CTOs prioriza proximidade e permite ampliar a lista sem centenas de cartoes',async({page})=>{
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'LIVE',enabled:true,productionReady:false,sources:[],audit:{}})}));
  const candidates=Array.from({length:25},(_,i)=>({ctoId:String(i+1),status:'ANALISE_TECNICA',geographicMeters:2500-i*100,routeMeters:null,available:2,updatedOn:null,sheet:null,row:null,reasons:[]}));
  await page.route('**/api/viabilidade',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id:'fixture-volume',evaluatedAt:new Date().toISOString(),origin:'LIVE',status:'ANALISE_TECNICA',recommendedCtoId:null,candidates,reasons:[]})}));
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({contentType:'application/json',body:'{"rows":[]}'}));
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.locator('[data-cto-card]')).toHaveCount(10);
  await expect(page.locator('[data-cto-card]').first()).toContainText('25');
  await page.getByRole('button',{name:'Mostrar mais CTOs',exact:true}).click();
  await expect(page.locator('[data-cto-card]')).toHaveCount(20);
});

test('cada candidata mostra os identificadores correspondentes do IXC e da planilha',async({page})=>{
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'LIVE',enabled:true,productionReady:false,sources:[],audit:{}})}));
  const candidate={ctoId:'541',status:'ANALISE_TECNICA',geographicMeters:78,routeMeters:157,routeSource:'FIBERDOCS_ESTIMATE',available:1,ixcCapacity:16,sheetCapacity:8,updatedOn:'2026-07-31',sheetCtoName:'N220-1X8',sheet:'CTO,s CP',row:221,reasons:['TRAJETO_ESTIMADO_FIBERDOCS','CAPACIDADE_DIVERGENTE']};
  await page.route('**/api/viabilidade',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id:'fixture-sources',evaluatedAt:new Date().toISOString(),origin:'LIVE',status:'ANALISE_TECNICA',recommendedCtoId:null,candidates:[candidate],reasons:[]})}));
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({rows:[{id:'541',name:'N220-1X8',location:null}]})}));
  await page.route('**/api/viabilidade?view=network*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({poles:[],cables:[],cableCount:0,complete:false,issues:[],fetchedAt:new Date().toISOString()})}));
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  const card=page.locator('[data-cto-card]').first();
  await expect(card).toContainText('IXC #541');
  await expect(card).toContainText('Planilha: N220-1X8');
  await expect(card).toContainText('CTO,s CP · linha 221');
  await expect(card).toContainText('Rota FiberDocs');
  await expect(card).toContainText('157 m');
  await expect(card).toContainText('Capacidade (IXC / planilha)');
  await expect(card).toContainText('16 / 8');
  await expect(card).toContainText('Rota encontrada: 157 m pela rede FiberDocs');
});

test('fontes mostra auditoria atual ao consultar o endpoint de diagnóstico',async({page})=>{
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'LIVE',enabled:true,productionReady:false,sources:[],blockers:[]})}));
  let calls=0;
  await page.route('**/api/viabilidade?view=diagnostics',route=>{calls++;return route.fulfill({contentType:'application/json',body:JSON.stringify({checkedAt:'2026-10-06T18:00:00.000Z',regions:{
    AC:{sources:{ixc:{complete:true,records:500,active:490,missingCoordinates:2},sheets:{complete:true,records:732}},sheet:{rows:732,ambiguousCodes:102,rowsInAmbiguousCodes:240,unrecognizedRows:44,missingCoordinates:506,missingVacancies:92,missingCapacity:68,aboveCapacity:5,noVacancies:48,ambiguousExamples:[{code:'N-01',rows:[{originalName:'N-01',sheet:'CTO,s AC',row:4,olt:'AC',pon:'1601',available:2,capacity:16,updatedOn:'2026-10-06'},{originalName:'N-01',sheet:'CTO,s AC',row:5,olt:'AC',pon:'1602',available:3,capacity:16,updatedOn:'2026-10-06'}]}]},matching:{unique:300,ambiguous:102,missing:44,unrecognized:44},fiberDocs:{complete:true,poles:347,cableCount:227,cablesWithGeometry:227,missingCableCount:0,missingCables:[],issues:[],fetchedAt:'2026-10-06T17:59:00.000Z'}},
    CP:{sources:{ixc:{complete:true,records:500,active:490,missingCoordinates:2},sheets:{complete:true,records:657}},sheet:{rows:657,ambiguousCodes:0,rowsInAmbiguousCodes:0,unrecognizedRows:9,missingCoordinates:133,missingVacancies:18,missingCapacity:21,aboveCapacity:5,noVacancies:79},matching:{unique:648,ambiguous:0,missing:9,unrecognized:9},fiberDocs:{complete:false,poles:20,cableCount:222,cablesWithGeometry:214,missingCableCount:8,missingCables:[{id:'801',name:'Trecho sem pontos'}],issues:['CABO_GEOMETRIA_PENDENTE'],fetchedAt:'2026-10-06T17:59:00.000Z'}}}})});});
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Fontes e pendências',exact:true}).click();
  await expect(page.getByText('Diagnóstico conferido em 06/10/2026, 15:00',{exact:false})).toBeVisible();
  await expect(page.getByText('102 códigos ambíguos',{exact:false}).first()).toBeVisible();
  await page.locator('[data-testid="diagnostic-region-AC"]').getByText('Conferir vínculos duplicados (102 códigos)',{exact:true}).click();
  await expect(page.getByText('VLAN/PON 1601')).toBeVisible();
  await expect(page.getByText('Cabo sem geometria: Trecho sem pontos (IXC #801)')).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole('button',{name:'Atualizar diagnóstico',exact:true}).click();
  await expect.poll(()=>calls).toBe(2);
});

test('resultado prepara ficha técnica da atividade ligada ao lead e permite copiá-la',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.route('**/api/viabilidade?view=status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'LIVE',enabled:true,productionReady:false,sources:[],blockers:[]})}));
  const candidate={ctoId:'541',status:'VIAVEL',geographicMeters:78,routeMeters:157,routeSource:'FIBERDOCS_ESTIMATE',available:1,ixcCapacity:8,sheetCapacity:8,updatedOn:'2026-10-06',sheetCtoName:'N220-1X8',sheet:'CTO,s AC',row:221,sheetMatches:[{originalName:'N220-1X8',sheet:'CTO,s AC',row:221,olt:'AC',pon:'1601',available:1,capacity:8,updatedOn:'2026-10-06'}],reasons:['TRAJETO_ESTIMADO_FIBERDOCS']};
  await page.route('**/api/viabilidade',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id:'fixture-activity',evaluatedAt:'2026-10-06T18:00:00.000Z',origin:'LIVE',status:'VIAVEL',recommendedCtoId:'541',candidates:[candidate],reasons:[],sources:{ixcFetchedAt:'2026-10-06T17:59:00.000Z',sheetsFetchedAt:'2026-10-06T17:59:00.000Z'},leadId:5,network:{poles:[],cables:[],cableCount:0,complete:true,issues:[],fetchedAt:'2026-10-06T17:59:00.000Z'}})}));
  await page.route('**/api/viabilidade?view=ctos*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({rows:[{id:'541',name:'N220-1X8',location:{latitude:-1.02,longitude:-46.63}}]})}));
  await page.goto('/?tab=viabilidade&leadId=5');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.02');await page.getByLabel('Longitude').fill('-46.63');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ficha técnica pronta',exact:true})).toBeVisible();
  const card=page.getByTestId('technical-activity');
  await expect(card).toContainText('Lead #5');
  await expect(card).toContainText('IXC #541');
  await expect(card).toContainText('CTO,s AC · linha 221');
  await expect(card).toContainText('1 vaga');
  await expect(card).toContainText('157 m');
  await page.getByRole('button',{name:'Copiar ficha técnica',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Ficha técnica copiada');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('Rota FiberDocs: 157 m');
});

test('modulo integrado consulta tres cenarios, mostra motivos e mantem historico apos recarregar',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?tab=viabilidade');
  await expect(page.getByRole('heading',{name:'Viabilidade de instalação',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Consultar viabilidade',exact:true})).toBeDisabled();
  for(const [scenario,result] of [['Com vaga','Viável na demonstração'],['Sem vaga','Inviável na demonstração'],['Sem trajeto','Análise técnica na demonstração']]){
    await page.getByRole('button',{name:scenario,exact:true}).click();
    await expect(page.getByRole('button',{name:'Consultar viabilidade',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
    await expect(page.getByRole('heading',{name:result,exact:true})).toBeVisible();
  }
  await expect(page.getByText(/Sem geometria de rota calculada/)).toBeVisible();
  await page.getByRole('button',{name:'Com vaga',exact:true}).click();
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Viável na demonstração',exact:true})).toBeVisible();
  await page.screenshot({path:'output/playwright/viabilidade-desktop.png',fullPage:true});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar resultado',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/^viabilidade-.*\.json$/);
  await page.reload();await page.getByRole('button',{name:'Histórico',exact:true}).click();
  await expect(page.getByRole('cell',{name:'DEMO-AC-01',exact:true}).first()).toBeVisible();
  await page.getByLabel('Filtrar resultado').selectOption('INVIAVEL');
  await expect(page.getByRole('cell',{name:'Inviável',exact:true}).first()).toBeVisible();
  await expect(page.getByRole('cell',{name:'Viável',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('entrada vazia, falha de servidor e fontes pendentes ficam visiveis sem aprovacao',async({page})=>{
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Informe latitude e longitude');
  await page.getByRole('button',{name:'Com vaga',exact:true}).click();
  await page.route('**/api/viabilidade',async route=>{
    if(route.request().method()==='POST')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'EVALUATION_AUDIT_UNAVAILABLE'})});
    else await route.continue();
  });
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Não foi possível registrar');
  await expect(page.getByRole('heading',{name:'Viável na demonstração',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Fontes e pendências',exact:true}).click();
  await expect(page.getByRole('button',{name:'Atualizar diagnóstico',exact:true})).toBeDisabled();
  await expect(page.getByText('O diagnóstico exige IXC, planilha e FiberDocs em modo operacional.')).toBeVisible();
});
test('mobile preserva consulta, menu e retorno ao funil sem overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Com vaga',exact:true}).click();
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Viável na demonstração',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'output/playwright/viabilidade-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'Voltar ao funil',exact:true}).click();
  await expect(page).toHaveURL(/tab=leads/);
  await expect(page.getByText('Leads & Funil').first()).toBeAttached();
});
test('atalho do lead abre a consulta no mesmo painel sem alterar o registro comercial',async({page})=>{
  await page.goto('/?tab=leads');
  await page.getByRole('button',{name:'Lista',exact:true}).click();
  await page.getByRole('button',{name:'Abrir detalhes do lead Carlos Santos',exact:true}).click();
  await page.getByRole('link',{name:'Consultar viabilidade de instalação',exact:true}).click();
  await expect(page).toHaveURL(/tab=viabilidade&leadId=5/);
  await expect(page.getByText('lead #5',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Com vaga',exact:true}).click();
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Viável na demonstração',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Histórico',exact:true}).click();
  await expect(page.getByText('Lead #5',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Consulta no contexto do lead #5').first()).toBeVisible();
  await page.getByRole('button',{name:'Leads & Funil',exact:true}).click();
  await expect(page).toHaveURL(/tab=leads$/);
  await page.getByRole('button',{name:'Viabilidade',exact:true}).click();
  await expect(page).toHaveURL(/tab=viabilidade$/);
  await expect(page.getByText('Consulta no contexto do lead #5').first()).toHaveCount(0);
});
