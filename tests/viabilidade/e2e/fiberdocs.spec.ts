import {test,expect} from '@playwright/test';

test('KML mostra postes e cabo curvo como conferencia sem alterar a decisao do servidor',async({page})=>{
  await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/></svg>'}));
  await page.route('**/api/viabilidade?view=status',r=>r.fulfill({json:{mode:'LIVE',enabled:true,productionReady:false,sources:[],audit:{}}}));
  await page.route('**/api/viabilidade?view=ctos*',r=>r.fulfill({json:{rows:[{id:'1',name:'CTO teste',location:{latitude:-1.101,longitude:-47.101}}]}}));
  await page.route('**/api/viabilidade?view=network*',r=>r.fulfill({json:{poles:[{id:'pt1',name:'Poste API',location:{latitude:-1.1005,longitude:-47.101}}],cables:[],cableCount:1,complete:true,issues:['CABO_GEOMETRIA_PENDENTE'],fetchedAt:new Date().toISOString()}}));
  await page.route('**/api/viabilidade',r=>r.fulfill({json:{id:'fixture',origin:'LIVE',evaluatedAt:new Date().toISOString(),status:'ANALISE_TECNICA',recommendedCtoId:null,candidates:[],reasons:['TRAJETO_NAO_CONFIRMADO']}}));
  await page.goto('/?tab=viabilidade');
  await page.getByRole('button',{name:'Latitude e longitude',exact:true}).click();
  await page.getByLabel('Latitude').fill('-1.1');await page.getByLabel('Longitude').fill('-47.1');
  await page.getByRole('button',{name:'Consultar viabilidade',exact:true}).click();
  await expect(page.getByText(/1 poste com coordenada · 0 de 1 cabo com geometria/)).toBeVisible();
  await expect(page.getByText('Há cabos sem vértices válidos; eles não são desenhados.')).toBeVisible();
  await page.getByLabel('Importar KML do FiberDocs').setInputFiles({name:'rede.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Cabo em L</name><LineString><coordinates>-47.101,-1.101,0 -47.101,-1.1,0 -47.1,-1.1,0</coordinates></LineString></Placemark><Placemark><name>Poste exportado</name><Point><coordinates>-47.101,-1.1,0</coordinates></Point></Placemark></Document></kml>')});
  await expect(page.getByText(/KML de conferência carregado nesta sessão: 1 cabo\(s\), 1 ponto\(s\)/)).toBeVisible();
  await expect(page.getByText(/Não há caminho calculado para esta CTO/)).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#7c3aed"]')).toHaveCount(1);
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#0d9488"]')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Análise técnica',exact:true})).toBeVisible();
  await page.getByLabel('Cabos FiberDocs',{exact:true}).uncheck();
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#7c3aed"]')).toHaveCount(0);
  await page.getByLabel('Cabos FiberDocs',{exact:true}).check();
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#7c3aed"]')).toHaveCount(1);
  await page.screenshot({path:'output/playwright/viabilidade-fiberdocs.png',fullPage:true});
  await page.getByLabel('Importar KML do FiberDocs').setInputFiles({name:'malicioso.kml',mimeType:'text/xml',buffer:Buffer.from('<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>')});
  await expect(page.getByText('KML inválido ou maior que 5 MB.')).toBeVisible();
});
