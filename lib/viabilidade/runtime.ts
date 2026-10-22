import {createIxcHttpClient} from './adapters/ixc-http';
import {createIxcAdapter} from './adapters/ixc';
import {createPublicSheetsAdapter} from './adapters/public-sheets';
import {createSheetsAdapter,createServiceAccountTokenProvider} from './adapters/sheets';
import {unavailableIxcSnapshot} from './adapters/live';
import {createFiberDocsSource} from './adapters/fiberdocs';
import {buildViabilityDiagnostics, type RegionDiagnosticsInput} from './diagnostics';
import type {Region} from './domain/types';
import type {DataSources,FetchLike} from './adapters/ports';
import type {Policy} from './domain/types';
import {loadRoadGraph} from './road-graph';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

type PanelIxcCredentials={hasCredentials:boolean;cleanDomain:string;token:string};
function isApprovedProjectSubset(value:unknown,approved:{AC:{field:'id_projeto';values:string[]};CP:{field:'id_projeto';values:string[]}}):boolean {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  return (['AC','CP'] as const).every(region=>{
    const candidate=(value as Record<string,unknown>)[region];
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return false;
    const selector=candidate as Record<string,unknown>;
    return selector.field==='id_projeto'&&Array.isArray(selector.values)&&selector.values.length>0
      &&selector.values.every(id=>typeof id==='string'&&approved[region].values.includes(id));
  });
}

export async function createPanelLiveRuntime(env:Record<string,string|undefined>,resolveCredentials:()=>Promise<PanelIxcCredentials>) {
  if(env.VIABILITY_LIVE_ENABLED!=='true')return createLiveRuntime(env);
  const credentials=await resolveCredentials();
  return createLiveRuntime(credentials.hasCredentials
    ? {...env,IXC_DOMAIN:credentials.cleanDomain,IXC_TOKEN:credentials.token}
    : env);
}

export function createLiveRuntime(env:Record<string,string|undefined>,fetcher:FetchLike=fetch) {
  // Projetos regionais confirmados pelo usuário e conferidos no cadastro FiberDocs df_projeto.
  const defaults={AC:{field:'id_projeto' as const,values:['1','3','4','5','6','7','8','9','10','11','12','13','14','16','17','18','19','20']},CP:{field:'id_projeto' as const,values:['2','21']}};
  let ixc:ReturnType<typeof createIxcAdapter>|null=null;
  let network:ReturnType<typeof createFiberDocsSource>|undefined;
  let selectorsExplicit=false;
  try{
    const configured=env.VIABILITY_IXC_SELECTORS_JSON?JSON.parse(env.VIABILITY_IXC_SELECTORS_JSON):null;
    const useApprovedScope=configured!==null&&isApprovedProjectSubset(configured,defaults);
    const selectors=configured&&!useApprovedScope?configured:defaults;
    selectorsExplicit=Boolean(configured&&!useApprovedScope);
    const rawDomain=env.IXC_DOMAIN?.trim()||'https://ixc.gentedigital.com.br/webservice/v1';
    const baseUrl=/^[a-z][a-z0-9+.-]*:\/\//i.test(rawDomain)?rawDomain:'https://'+rawDomain;
    ixc=createIxcAdapter(createIxcHttpClient({baseUrl,webserviceToken:env.IXC_TOKEN||'',regionSelectors:selectors,pageSize:400},fetcher));
    if(selectors.AC.field==='id_projeto'&&selectors.CP.field==='id_projeto')network=createFiberDocsSource({baseUrl,token:env.IXC_TOKEN||'',projects:{AC:selectors.AC.values,CP:selectors.CP.values}},fetcher);
  }catch{ixc=null}
  const sheetId=env.VIABILITY_SPREADSHEET_ID||'1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ';
  let sheets:ReturnType<typeof createPublicSheetsAdapter>|null=null;
  try{sheets=env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? createSheetsAdapter(sheetId,createServiceAccountTokenProvider(env.GOOGLE_SERVICE_ACCOUNT_JSON,fetcher),fetcher)
    : createPublicSheetsAdapter(sheetId,fetcher)}catch{sheets=null}
  const coverageConfirmed=selectorsExplicit?env.VIABILITY_REGIONAL_COVERAGE_CONFIRMED==='true':true;
  const currentSnapshot=env.VIABILITY_FRESHNESS_MODE==='CURRENT_SNAPSHOT';
  const age=env.VIABILITY_MAX_UPDATE_AGE_DAYS;
  const maxAge=age&&/^\d+$/.test(age)&&Number(age)<=365?Number(age):null;
  const policy:Policy={maxDistanceMeters:500,maxUpdateAgeDays:maxAge,freshnessMode:currentSnapshot?'CURRENT_SNAPSHOT':'ROW_DATE',version:currentSnapshot?'live-current-snapshot-v1':'live-row-date-v1',regionalCoverageConfirmed:coverageConfirmed};
  const roadGraphsPresent=['ac','cp'].every(region=>existsSync(resolve(process.cwd(),'data/viabilidade/osm/graphs',`${region}.json.gz`)));
  const sources:DataSources={loadIxc:r=>ixc?ixc.loadIxc(r):Promise.resolve(unavailableIxcSnapshot(r)),loadSheets:r=>sheets?sheets.loadSheets(r):Promise.resolve({rows:[],fetchedAt:new Date().toISOString(),complete:false,origin:'LIVE',issues:['PLANILHA_CONFIGURATION_INVALID']})};
  const diagnostics=async()=>{
    const regions=['AC','CP'] as const;
    const loaded=await Promise.all(regions.map(async region=>{
      const [ixcResult,sheetResult,networkResult]=await Promise.allSettled([
        sources.loadIxc(region),sources.loadSheets(region),network?network(region):Promise.resolve(null)
      ]);
      const fetchedAt=new Date().toISOString();
      return [region,{
        ixc:ixcResult.status==='fulfilled'?ixcResult.value:{...unavailableIxcSnapshot(region),fetchedAt,issues:['IXC_READ_FAILED']},
        sheets:sheetResult.status==='fulfilled'?sheetResult.value:{rows:[],fetchedAt,complete:false,origin:'LIVE' as const,issues:['PLANILHA_READ_FAILED']},
        network:networkResult.status==='fulfilled'?networkResult.value:null
      }] as const;
    }));
    return buildViabilityDiagnostics(Object.fromEntries(loaded) as Record<Region,RegionDiagnosticsInput>);
  };
  return {origin:'LIVE' as const,enabled:env.VIABILITY_LIVE_ENABLED==='true'&&Boolean(ixc&&sheets),sources,policy,roadGraph:loadRoadGraph,...(network?{network}:{}),diagnostics,
    sourceStatus:{sources:[{name:'IXC / InMap Sales',state:ixc?(selectorsExplicit?'Consulta real por API com seletores regionais configurados.':'Consulta real por API; escopo AC 1, 3, 4–14 e 16–20; CP 2 e 21.'):'Credencial ou configuração IXC indisponível'},
      {name:'Planilha CP / AC',state:sheets?'Leitura real A:O; vagas consultadas no momento da avaliação.':'Acesso à planilha indisponível'},
      {name:'FiberDocs',state:network?'Leitura de postes e cabos com geometria por projeto via df_elemento + df_elemento_coordenada; dados incompletos acionam o fallback local OSM.':'Leitura indisponível; a consulta tenta usar o grafo local OSM.'},
      {name:'OpenStreetMap',state:roadGraphsPresent?'Snapshots regionais empacotados; o servidor valida o grafo ao consultar e estima pela malha de ruas.':'Snapshots regionais ausentes; o fallback por ruas está indisponível até gerar os grafos.'},
      {name:'Trajeto de instalação',state:'Prioridade: rota FiberDocs completa; sem caminho conectado, o sistema estima automaticamente pelas ruas OSM locais. Reserva de 20 m incluída nas estimativas automáticas; a passagem física exige conferência.'}],
      blockers:[...(!coverageConfirmed?['CONFIRMAR_MAPEAMENTO_IXC']:[]),...(!currentSnapshot&&maxAge===null?['DEFINIR_VALIDADE_DAS_VAGAS']:[]),...(!roadGraphsPresent?['GERAR_GRAFOS_OSM_REGIONAIS']:[])]}};
}
