'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { MapPin, Search, History, Network, Download, RefreshCw, Loader2, CircleAlert, CheckCircle2, XCircle, ArrowLeft, Copy } from 'lucide-react';
import type { Decision, RouteComponents, RouteGeometry, RouteSource, Status } from '@/lib/viabilidade/domain/types';
import type { FiberNetwork } from '@/lib/viabilidade/domain/network-path';
import type { ViabilityDiagnostics } from '@/lib/viabilidade/diagnostics';
import { buildTechnicalActivityText } from '@/lib/viabilidade/activity';
import { describeFiberDocsIssues } from '@/lib/viabilidade/fiberdocs-issues';
import AddressLocator from './address-locator';
import type { Point } from '@/lib/viabilidade/domain/types';

const CoverageMap = dynamic(() => import('./coverage-map'), {
  ssr: false,
  loading: () => <div className="grid min-h-64 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">Carregando mapa…</div>,
});

type Box = {id:string;name:string;location:{latitude:number;longitude:number}|null};
type HistoryRow = {id:string;evaluatedAt:string;origin:string;status:Status;region?:string|null;recommendedCtoId:string|null;leadId?:number|null;reasons:string[];candidates?:{ctoId:string;routeMeters:number|null;routeSource:RouteSource|null;routeComponents:RouteComponents|null}[]};
type Readiness = {mode:string;enabled:boolean;productionReady:boolean;sources:{name:string;state:string}[];blockers?:string[]};
const names:Record<Status,string> = {VIAVEL:'Viável',INVIAVEL:'Inviável',ANALISE_TECNICA:'Análise técnica'};
const tones:Record<Status,string> = {VIAVEL:'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',INVIAVEL:'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',ANALISE_TECNICA:'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'};
const explanations:Record<string,string> = {
  TRAJETO_NAO_CONFIRMADO:'O trajeto de instalação ainda precisa ser confirmado.',TRAJETO_ESTIMADO_FIBERDOCS:'Metragem calculada pela geometria dos cabos do FiberDocs; confirme a passagem em campo.',
  TRAJETO_ESTIMADO_OSM:'Rota estimada pela malha de vias do OpenStreetMap. Isso não comprova fibra, ocupação ou passagem; mantenha a CTO em análise técnica.',
  OSM_GRAFO_INDISPONIVEL:'O grafo regional de ruas não está disponível no servidor.',OSM_FORA_DA_COBERTURA:'O ponto ou a CTO está fora da cobertura mapeada para o grafo de ruas.',
  OSM_ENCAIXE_FORA_DA_VIA:'O imóvel ou a CTO está a mais de 30 m de uma via do grafo OSM.',
  OSM_SEM_CAMINHO_CONTINUO:'A malha OSM não tem um caminho conectado entre o imóvel e a CTO.',OSM_ESTIMATIVA_ACIMA_DO_LIMITE:'A estimativa OSM com acessos e reserva supera 500 m; requer análise técnica.',
  FIBERDOCS_LEITURA_INDISPONIVEL:'Não foi possível ler os cabos do FiberDocs nesta consulta.',FIBERDOCS_REDE_INCOMPLETA:'Há cabos sem geometria completa no FiberDocs; o sistema não aprova por aproximação.',
  FIBERDOCS_SEM_CABOS:'Nenhum cabo com geometria disponível no FiberDocs para calcular a rota.',REDE_SEM_CAMINHO_CONTINUO:'Os cabos cadastrados não formam um caminho contínuo entre a CTO e o ponto.',
  CTO_FORA_DO_LIMITE:'CTO além do limite geográfico de 500 m.',
  TRAJETO_FORA_DO_LIMITE:'Trajeto confirmado ou estimativa FiberDocs acima de 500 m.',SEM_VAGAS:'Sem vagas disponíveis nesta CTO.',SEM_VAGAS_NA_REGIAO:'As CTOs elegíveis não têm vagas.',
  CANDIDATA_COM_DADOS_INSUFICIENTES:'Há CTOs com dados que precisam de conferência.',SEM_CTO_ELEGIVEL:'Nenhuma CTO atende aos critérios desta consulta.',
  CTO_AMBIGUA:'Há mais de uma linha para o mesmo código de CTO.',CTO_AUSENTE_NA_PLANILHA:'CTO não localizada na planilha.',
  COORDENADA_IXC_AUSENTE:'CTO sem coordenada confirmada no IXC.',COORDENADAS_DIVERGENTES:'As coordenadas das fontes divergem.',
  COORDENADA_PLANILHA_INVALIDA:'A planilha não informa posição; a rota usa a coordenada do IXC e os cabos FiberDocs.',
  SEM_CTO_ATIVA_NA_REGIAO:'Nenhuma CTO ativa nesta região da fonte consultada.',DADOS_DESATUALIZADOS:'A atualização das vagas está fora do prazo configurado.',
  VAGAS_NAO_CONFIRMADAS:'Quantidade de vagas não confirmada.',CAPACIDADE_DIVERGENTE:'Capacidade diferente entre as fontes.',VAGAS_ACIMA_DA_CAPACIDADE:'Vagas acima da capacidade informada.',
  RESTRICAO_PENDENTE_REVISAO:'Existe uma restrição técnica pendente de revisão.',DATA_ATUALIZACAO_AUSENTE:'Data de atualização ausente.',DATA_ATUALIZACAO_FUTURA:'Data de atualização no futuro.',
  FONTE_IXC_INCOMPLETA:'A leitura do IXC está incompleta.',FONTE_PLANILHA_INCOMPLETA:'A leitura da planilha está incompleta.',
  ESQUEMA_PLANILHA_ALTERADO:'A estrutura da planilha mudou.',COBERTURA_REGIONAL_NAO_CONFIRMADA:'Cobertura regional ainda não confirmada.',REGRA_VALIDADE_NAO_CONFIGURADA:'Prazo de validade das vagas ainda não definido.'
};
const errorMessages:Record<string,string> = {UNAUTHORIZED:'Sua sessão expirou. Entre novamente no painel.',LEAD_ACCESS_REFUSED:'O lead informado não está acessível à sua conta. Volte ao funil e selecione um lead permitido.',VIABILITY_NOT_CONFIGURED:'A consulta real ainda não está configurada. Confira a seção Fontes.',LIVE_DIAGNOSTICS_UNAVAILABLE:'O diagnóstico em tempo real exige as fontes operacionais.',EVALUATION_AUDIT_UNAVAILABLE:'Não foi possível registrar a consulta. Nenhum resultado foi confirmado.',ORIGIN_REFUSED:'A origem da solicitação foi recusada. Recarregue o painel.',BODY_TOO_LARGE:'A solicitação ultrapassou o limite permitido.',VIABILITY_UNAVAILABLE:'O serviço está indisponível. Tente novamente.'};
const reason = (code:string) => explanations[code] ?? 'Este dado precisa de conferência técnica.';
const date = (value:string) => new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
const meters = (value:number|null) => value===null?'Não confirmado':`${Math.round(value).toLocaleString('pt-BR')} m`;
async function api<T>(view:string,init:RequestInit={}):Promise<T> {
  const response=await fetch('/api/viabilidade'+view,{...init,cache:'no-store'});
  if(response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Sua sessão não está disponível. Entre novamente no painel.');
  const body=await response.json();
  if(!response.ok)throw new Error(errorMessages[body.error]??'Não foi possível concluir a solicitação. Confira os dados e tente novamente.');
  return body;
}
function exportJson(value:unknown,name:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function ViabilidadeView() {
  const params=useSearchParams();
  const linked=Number(params.get('leadId'));const leadId=Number.isSafeInteger(linked)&&linked>0?linked:null;
  const [view,setView]=useState<'consulta'|'history'|'sources'>('consulta');
  const [region,setRegion]=useState<'AC'|'CP'>('AC');
  const [latitude,setLatitude]=useState('');const [longitude,setLongitude]=useState('');const [reference,setReference]=useState('');
  const [locationMode,setLocationMode]=useState<'address'|'coordinates'>('address');
  const [locationConfirmed,setLocationConfirmed]=useState(false);
  const [addressSummary,setAddressSummary]=useState('');
  const [result,setResult]=useState<(Decision&{leadId?:number|null})|null>(null);
  const [boxes,setBoxes]=useState<Box[]>([]);const [readiness,setReadiness]=useState<Readiness|null>(null);
  const [diagnostics,setDiagnostics]=useState<ViabilityDiagnostics|null>(null);const [diagnosticsBusy,setDiagnosticsBusy]=useState(false);const [diagnosticsError,setDiagnosticsError]=useState('');
  const [network,setNetwork]=useState<FiberNetwork|null>(null);
  const [routeGeometries,setRouteGeometries]=useState<RouteGeometry[]>([]);
  const [networkRefreshBusy,setNetworkRefreshBusy]=useState(false);const [networkError,setNetworkError]=useState('');
  const [history,setHistory]=useState<HistoryRow[]>([]);const [filter,setFilter]=useState('');
  const [busy,setBusy]=useState(false);const [historyBusy,setHistoryBusy]=useState(false);const [error,setError]=useState('');
  const [stateError,setStateError]=useState('');const [historyError,setHistoryError]=useState('');
  const activeRequest=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void api<Readiness>('?view=status',{signal:controller.signal}).then(setReadiness).catch(e=>{if(!controller.signal.aborted)setStateError(e.message)});
    return ()=>{controller.abort();activeRequest.current?.abort()};
  },[]);
  function example(kind:'viavel'|'inviavel'|'analise') {
    setLocationMode('coordinates');setLocationConfirmed(false);setAddressSummary('');
    setRegion('AC');setLatitude(kind==='inviavel'?'12.355':kind==='analise'?'12.3452':'12.345');setLongitude('45.678');
    setReference('Exemplo fictício de instalação');setResult(null);setBoxes([]);setRouteGeometries([]);setError('');
  }
  async function consult(event:FormEvent) {
    event.preventDefault();setError('');setResult(null);setBoxes([]);setNetwork(null);setRouteGeometries([]);
    if(locationMode==='address'&&!locationConfirmed){setError('Localize o endereço e confirme o imóvel no mapa.');return}
    if(!latitude.trim()||!longitude.trim()) {setError('Informe latitude e longitude do ponto de instalação.');return}
    const lat=Number(latitude),lon=Number(longitude);
    if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180){setError('As coordenadas devem estar entre −90 e 90 para latitude e −180 e 180 para longitude.');return}
    const controller=new AbortController();activeRequest.current=controller;setBusy(true);
    const timeout=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await api<Decision&{leadId?:number|null;network?:FiberNetwork|null;routeGeometries?:RouteGeometry[]}>('' ,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},
        body:JSON.stringify({region,latitude:lat,longitude:lon,...(addressSummary.trim()||reference.trim()?{address:addressSummary.trim()||reference.trim()}:{}),...(leadId?{leadId}:{})})});
      if(controller.signal.aborted)return;
      const {network:networkSnapshot,routeGeometries:calculatedRoutes,leadId:linkedLead,...decision}=response;
      setResult({...decision,...(linkedLead===undefined?{}:{leadId:linkedLead})});
      setRouteGeometries(calculatedRoutes??[]);
      const [geo,fiber]=await Promise.allSettled([
        api<{rows:Box[]}>('?view=ctos&region='+region,{signal:controller.signal}),
        Object.prototype.hasOwnProperty.call(response,'network')?Promise.resolve(networkSnapshot??null):api<FiberNetwork>('?view=network&region='+region,{signal:controller.signal})
      ]);
      if(controller.signal.aborted)return;
      if(geo.status==='fulfilled')setBoxes(geo.value.rows);else setError('A decisão foi registrada, mas a visualização das coordenadas não pôde ser carregada.');
      if(fiber.status==='fulfilled')setNetwork(fiber.value);
    } catch(e) {if(activeRequest.current===controller)setError(controller.signal.aborted?'A consulta excedeu o tempo de espera. Tente novamente.':(e as Error).message)}
    finally {clearTimeout(timeout);if(activeRequest.current===controller){setBusy(false);activeRequest.current=null}}
  }
  async function loadHistory() {
    setHistoryBusy(true);setHistoryError('');
    try {const data=await api<{rows:HistoryRow[]}>('?view=history');setHistory(data.rows)}
    catch(e){setHistoryError((e as Error).message)}finally{setHistoryBusy(false)}
  }
  async function refreshNetwork() {
    setNetwork(null);setNetworkRefreshBusy(true);setNetworkError('');
    try {setNetwork(await api<FiberNetwork>('?view=network&region='+region));}
    catch(e){setNetworkError((e as Error).message)}finally{setNetworkRefreshBusy(false)}
  }
  async function loadDiagnostics() {
    setDiagnosticsBusy(true);setDiagnosticsError('');
    try {setDiagnostics(await api<ViabilityDiagnostics>('?view=diagnostics'))}
    catch(e){setDiagnostics(null);setDiagnosticsError((e as Error).message)}finally{setDiagnosticsBusy(false)}
  }
  function switchView(next:typeof view) {setView(next);if(next==='history')void loadHistory();if(next==='sources')void loadDiagnostics()}
  function invalidateLocation() {setLatitude('');setLongitude('');setLocationConfirmed(false);setResult(null);setBoxes([]);setNetwork(null);setRouteGeometries([]);setError('')}
  function useCoordinates() {if(locationMode==='coordinates')return;setLocationMode('coordinates');setLatitude('');setLongitude('');setLocationConfirmed(false);setResult(null);setBoxes([]);setNetwork(null);setRouteGeometries([]);setError('')}
  function choosePoint(point:Point) {setLatitude(String(point.latitude));setLongitude(String(point.longitude));setLocationConfirmed(false);setResult(null);setBoxes([]);setNetwork(null);setRouteGeometries([]);setError('')}
  const mapPoint=latitude.trim()&&longitude.trim()&&Number.isFinite(Number(latitude))&&Math.abs(Number(latitude))<=90&&Number.isFinite(Number(longitude))&&Math.abs(Number(longitude))<=180
    ? {latitude:Number(latitude),longitude:Number(longitude)} : null;
  const historyRows=history.filter(r=>!filter||r.status===filter);
  return <section className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="font-display text-3xl font-bold tracking-tight">Viabilidade de instalação</h2><p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-zinc-400">Confira a CTO, as vagas e o trajeto antes de confirmar a instalação.</p></div>
      <a href="?tab=leads" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"><ArrowLeft size={16}/> Voltar ao funil</a>
    </div>
    <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <CircleAlert size={20} className="mt-0.5 shrink-0"/><div><strong>{readiness?.mode==='LIVE'?'Consulta às fontes reais':readiness?.enabled?'Demonstração com dados fictícios':'Integração real pendente'}</strong><p className="mt-1">{readiness?.mode==='LIVE'?'As vagas refletem a leitura atual da planilha. Cobertura incompleta, divergências ou trajeto não confirmado exigem análise técnica.':readiness?.enabled?'Os resultados abaixo testam o fluxo do painel. Não autorizam instalações reais.':'As fontes operacionais precisam ser validadas antes de liberar consultas reais.'}</p></div>
    </div>
    {leadId&&<div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">Consulta no contexto do <strong>lead #{leadId}</strong>. O resultado técnico não altera a indicação, o status de venda ou a comissão.</div>}
    <nav aria-label="Seções de viabilidade" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-zinc-800">
      {([['consulta','Consultar',Search],['history','Histórico',History],['sources','Fontes e pendências',Network]] as const).map(([id,label,Icon])=><button type="button" key={id} aria-current={view===id?'page':undefined} onClick={()=>switchView(id)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${view===id?'border-sky-600 text-sky-800 dark:text-sky-300':'border-transparent text-slate-500 dark:text-zinc-400'}`}><Icon size={17}/>{label}</button>)}
    </nav>
    {stateError&&<ErrorMessage message={stateError}/>}
    {view==='consulta'&&<div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <form onSubmit={consult} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 font-semibold"><MapPin size={18} className="text-sky-700"/>Ponto de instalação</div>
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
          <label className="block text-sm font-medium">Região<select aria-label="Região" value={region} onChange={e=>{setRegion(e.target.value as 'AC'|'CP');setAddressSummary('');invalidateLocation()}} className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-2.5 dark:border-zinc-700"><option>AC</option><option>CP</option></select></label>
          <div role="group" aria-label="Método de localização" className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={locationMode==='address'} onClick={()=>{setLocationMode('address');invalidateLocation()}} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${locationMode==='address'?'border-sky-700 bg-sky-50 text-sky-900 dark:border-sky-600 dark:bg-sky-950/50 dark:text-sky-100':'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}>Endereço</button>
            <button type="button" aria-pressed={locationMode==='coordinates'} onClick={useCoordinates} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${locationMode==='coordinates'?'border-sky-700 bg-sky-50 text-sky-900 dark:border-sky-600 dark:bg-sky-950/50 dark:text-sky-100':'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}>Latitude e longitude</button>
          </div>
          {locationMode==='address'&&<AddressLocator key={region} region={region} onLocated={choosePoint} onInvalidated={invalidateLocation} onAddressChange={setAddressSummary} onUseCoordinates={useCoordinates}/>}
          <label className="block text-sm font-medium">Referência <span className="font-normal text-slate-500">(opcional)</span><input value={reference} onChange={e=>{setReference(e.target.value);setResult(null);setRouteGeometries([])}} maxLength={240} placeholder="Local ou identificação da consulta" className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-2.5 dark:border-zinc-700"/></label>
          {locationMode==='coordinates'&&<><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium">Latitude<input aria-label="Latitude" value={latitude} onChange={e=>{setLatitude(e.target.value);setResult(null);setBoxes([]);setNetwork(null);setRouteGeometries([])}} inputMode="decimal" placeholder="Ex.: −1.02" className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-transparent p-2.5 dark:border-zinc-700"/></label><label className="block text-sm font-medium">Longitude<input aria-label="Longitude" value={longitude} onChange={e=>{setLongitude(e.target.value);setResult(null);setBoxes([]);setNetwork(null);setRouteGeometries([])}} inputMode="decimal" placeholder="Ex.: −46.63" className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-transparent p-2.5 dark:border-zinc-700"/></label></div><p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">Opção avançada para uma localização já conhecida.</p></>}
          {locationMode==='address'&&mapPoint&&<div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/40"><p>{locationConfirmed?'Localização confirmada.':'Confira a casa no mapa. Arraste o ponto azul ou clique sobre o imóvel.'}</p><button type="button" disabled={locationConfirmed} onClick={()=>setLocationConfirmed(true)} className="mt-2 font-semibold text-sky-800 underline disabled:no-underline dark:text-sky-300">{locationConfirmed?'Localização confirmada':'Confirmar localização'}</button></div>}
        </fieldset>
        {error&&<ErrorMessage message={error}/>}
        <button type="submit" disabled={busy||!readiness?.enabled||locationMode==='address'&&!locationConfirmed} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-800 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50">{busy?<Loader2 size={18} className="animate-spin"/>:<Search size={18}/>} {busy?'Consultando fontes…':'Consultar viabilidade'}</button>
        {readiness?.mode==='DEMO'&&<div className="border-t border-slate-200 pt-4 dark:border-zinc-800"><p className="mb-3 text-xs font-medium text-slate-600 dark:text-zinc-400">Preencher um cenário de teste</p><div className="flex flex-wrap gap-2">{([['viavel','Com vaga'],['inviavel','Sem vaga'],['analise','Sem trajeto']] as const).map(([id,label])=><button type="button" disabled={busy} onClick={()=>example(id)} key={id} className="rounded-md border border-slate-300 px-2.5 py-2 text-xs hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">{label}</button>)}</div></div>}
      </form>
      <div className="min-w-0 space-y-5">
      <CoverageMap key={region} boxes={boxes} point={mapPoint} recommended={result?.recommendedCtoId??null} network={network} routeGeometries={routeGeometries} routeCandidates={result?.candidates??[]} selectionKey={result?.id??null} roadGraphUpdatedAt={result?.sources?.roadGraphUpdatedAt} sourcesConsulted={!!result} {...(locationMode==='address'&&!busy?{onPointChange:choosePoint}:{})}/>
        <div aria-live="polite" aria-atomic="true">
          {busy?<div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><Loader2 className="animate-spin text-sky-700"/><p className="text-sm">Consultando CTOs e vagas, verificando critérios e registrando o resultado.</p></div>:result?<Result key={result.id} decision={result} boxes={boxes} leadId={leadId} address={addressSummary.trim()||reference.trim()}/>:<div className="rounded-xl border border-dashed border-slate-300 p-6 dark:border-zinc-700"><h3 className="font-semibold">A decisão aparece aqui</h3><p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Informe a localização. Você verá as CTOs candidatas e o motivo da decisão.</p></div>}
        </div>
      </div>
    </div>}
    {view==='history'&&<div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-semibold">Histórico de consultas</h3><p className="mt-1 text-sm text-slate-500">Até 100 consultas recentes permitidas à sua conta. Endereços e coordenadas não são armazenados aqui.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filtrar resultado" value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"><option value="">Todos os resultados</option>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><button type="button" aria-label="Atualizar histórico" disabled={historyBusy} onClick={()=>void loadHistory()} className="rounded-lg border border-slate-300 p-2 dark:border-zinc-700"><RefreshCw size={18} className={historyBusy?'animate-spin':''}/></button><button type="button" disabled={!historyRows.length} onClick={()=>exportJson(historyRows,'historico-viabilidade.json')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700"><Download size={16}/>Exportar</button></div></div>
      {historyError&&<ErrorMessage message={historyError}/>}
      {historyBusy?<p role="status" className="p-6 text-sm">Carregando histórico…</p>:<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-zinc-800 dark:bg-zinc-900"><tr>{['Data e hora','Região','Resultado','CTO indicada','Trajeto','Origem'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody>{historyRows.map(row=><tr key={row.id} className="border-b border-slate-100 last:border-0 dark:border-zinc-800"><td className="px-4 py-4 tabular-nums">{date(row.evaluatedAt)}<span className="mt-1 block text-xs text-slate-400" title={row.id}>{row.id.slice(0,8)}</span></td><td className="px-4">{row.region??'—'}</td><td className="px-4"><StatusBadge status={row.status}/></td><td className="px-4">{row.recommendedCtoId??'Não indicada'}{row.leadId&&<span className="block text-xs text-slate-500">Lead #{row.leadId}</span>}</td><td className="px-4">{historyRouteSummary(row)}</td><td className="px-4"><span className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:text-amber-200">{row.origin}</span></td></tr>)}</tbody></table>{!historyRows.length&&<p className="p-8 text-center text-sm text-slate-500">Nenhuma consulta para este filtro. Faça uma consulta para iniciar o histórico.</p>}</div>}
    </div>}
    {view==='sources'&&<div className="grid items-start gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-xl font-semibold">Estado das fontes</h3>
          <p className="mt-2 text-sm text-slate-500">A auditoria lê o IXC, a planilha e o FiberDocs na hora em que você atualiza.</p>
          <div className="mt-3">{readiness?.sources.map(source=><div key={source.name} className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0 dark:border-zinc-800"><strong className="text-sm">{source.name}</strong><span className="max-w-60 text-right text-sm text-slate-600 dark:text-zinc-400">{source.state}</span></div>)}</div>
          <p className="mt-2 rounded-lg bg-sky-50 p-3 text-sm leading-relaxed text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">A localização da CTO vem do IXC; vagas e split vêm da planilha. O cálculo prioriza um caminho FiberDocs completo e usa a malha local de ruas OSM como estimativa quando ele falta. As estimativas automáticas incluem 20 m de reserva e permanecem em análise técnica.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Leitura de postes e cabos</h4><p className="mt-1 text-sm text-slate-500">Somente leitura para {region}; não cria avaliação nem altera lead.</p></div><button type="button" onClick={()=>void refreshNetwork()} disabled={networkRefreshBusy} aria-busy={networkRefreshBusy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60 dark:border-zinc-700"><RefreshCw size={16} className={networkRefreshBusy?'animate-spin':''}/>{networkRefreshBusy?'Consultando…':`Atualizar FiberDocs (${region})`}</button></div>
          {networkError&&<p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{networkError}</p>}
          {network&&<div aria-live="polite" className="mt-3 space-y-1 text-sm"><p>{network.poles.length} {network.poles.length===1?'poste com coordenada':'postes com coordenadas'} · {network.cables.length} de {network.cableCount} {network.cableCount===1?'cabo':'cabos'} com geometria · leitura {network.complete?'completa':'parcial'}.</p>{describeFiberDocsIssues(network.issues).map(message=><p key={message} className="text-amber-800 dark:text-amber-300">{message}</p>)}{network.diagnostics?.missingCables?.map(cable=><p key={cable.id} className="text-amber-800 dark:text-amber-300">Cabo sem geometria: {cable.name} (IXC #{cable.id})</p>)}{network.diagnostics?.coordinateFields&&<p className="break-all text-slate-500">Campos recebidos da tabela de coordenadas: {network.diagnostics.coordinateFields.join(', ')}.</p>}{network.diagnostics?.coordinateDataFields&&<p className="break-all text-slate-500">Campos recebidos da tabela df_coordenada: {network.diagnostics.coordinateDataFields.join(', ')}.</p>}</div>}
        </section>
        <a href="https://docs.google.com/spreadsheets/d/1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ/edit" target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-sky-800 underline dark:text-sky-300">Abrir planilha de CTOs</a>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900" aria-labelledby="diagnostics-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="diagnostics-heading" className="text-xl font-semibold">Diagnóstico atual</h3><p className="mt-1 text-sm text-slate-500">Contagens calculadas a partir da leitura das fontes, sem valores históricos fixos.</p></div><button type="button" onClick={()=>void loadDiagnostics()} disabled={diagnosticsBusy||readiness?.mode!=='LIVE'} aria-busy={diagnosticsBusy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"><RefreshCw size={16} className={diagnosticsBusy?'animate-spin':''}/>{diagnosticsBusy?'Lendo fontes…':'Atualizar diagnóstico'}</button></div>
        {diagnosticsError&&<ErrorMessage message={diagnosticsError}/>}
        {readiness?.mode!=='LIVE'&&<p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">O diagnóstico exige IXC, planilha e FiberDocs em modo operacional.</p>}
        {diagnosticsBusy&&!diagnostics&&<p role="status" className="mt-4 text-sm text-slate-500">Lendo IXC, abas AC e CP e geometrias do FiberDocs…</p>}
        {diagnostics&&<><p className="mt-4 text-xs text-slate-500">Diagnóstico conferido em {date(diagnostics.checkedAt)}.</p><div className="mt-4 grid gap-4 2xl:grid-cols-2"><RegionDiagnosticsCard region="AC" data={diagnostics.regions.AC}/><RegionDiagnosticsCard region="CP" data={diagnostics.regions.CP}/></div></>}
      </section>
    </div>}
  </section>;
}
function ErrorMessage({message}:{message:string}) {return <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{message}</p>}
function StatusBadge({status}:{status:Status}) {return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${tones[status]}`}>{names[status]}</span>}
function historyRouteSummary(row:HistoryRow) {
  const candidate=row.candidates?.find(item=>item.ctoId===row.recommendedCtoId&&item.routeSource)
    ??row.candidates?.find(item=>item.routeSource);
  if(!candidate?.routeSource)return 'Não calculada';
  const label=candidate.routeSource==='OSM_ESTIMATE'?'Ruas OSM':candidate.routeSource==='FIBERDOCS_ESTIMATE'?'FiberDocs':'Confirmado';
  const total=candidate.routeMeters===null?'—':`${Math.round(candidate.routeMeters).toLocaleString('pt-BR')} m`;
  const parts=candidate.routeComponents;
  return <span>{label}: {total}{parts&&<span className="mt-1 block text-xs text-slate-500">Rua/rede {Math.round(parts.lineMeters)} m · acesso imóvel {Math.round(parts.installAccessMeters)} m · acesso CTO {Math.round(parts.ctoAccessMeters)} m · reserva {Math.round(parts.reserveMeters)} m</span>}</span>;
}
function routeLabel(source:RouteSource|null) {return source==='OSM_ESTIMATE'?'Rota estimada pelas ruas':source==='FIBERDOCS_ESTIMATE'?'Rota FiberDocs':source==='CONFIRMED'?'Trajeto confirmado':'Trajeto'}
function RegionDiagnosticsCard({region,data}:{region:'AC'|'CP';data:ViabilityDiagnostics['regions']['AC']}) {
  const complete=data.sources.ixc.complete&&data.sources.sheets.complete&&data.fiberDocs.complete;
  return <article data-testid={`diagnostic-region-${region}`} className="rounded-xl border border-slate-200 p-4 dark:border-zinc-700">
    <h4 className="font-semibold">{region==='AC'?'AC · Augusto Corrêa e projetos rurais':'CP · Capanema e Casa do Ferro'}</h4>
    <p className={`mt-2 text-xs font-semibold ${complete?'text-emerald-700 dark:text-emerald-300':'text-amber-800 dark:text-amber-300'}`}>Fontes {complete?'completas':'com pendências'} na última leitura</p>
    <dl className="mt-3 space-y-2 text-sm">
      <div><dt className="inline text-slate-500">IXC:</dt> <dd className="inline">{data.sources.ixc.active} CTOs ativas de {data.sources.ixc.records}; {data.sources.ixc.missingCoordinates} sem coordenada.</dd></div>
      <div><dt className="inline text-slate-500">Planilha:</dt> <dd className="inline">{data.sheet.rows} linhas; {data.sheet.ambiguousCodes} códigos ambíguos; {data.sheet.rowsInAmbiguousCodes} linhas nesses grupos; {data.sheet.unrecognizedRows} códigos não reconhecidos.</dd></div>
      <div><dt className="inline text-slate-500">Vínculos IXC → planilha:</dt> <dd className="inline">{data.matching.unique} únicos; {data.matching.ambiguous} ambíguos; {data.matching.missing} ausentes; {data.matching.unrecognized} não reconhecidos.</dd></div>
      <div><dt className="inline text-slate-500">Dados da planilha:</dt> <dd className="inline">{data.sheet.missingCoordinates} sem coordenada; {data.sheet.missingVacancies} sem vagas; {data.sheet.missingCapacity} sem split; {data.sheet.aboveCapacity} acima da capacidade; {data.sheet.noVacancies} sem vagas.</dd></div>
      <div><dt className="inline text-slate-500">FiberDocs:</dt> <dd className="inline">{data.fiberDocs.poles} postes; {data.fiberDocs.cablesWithGeometry} de {data.fiberDocs.cableCount} cabos com geometria; {data.fiberDocs.missingCableCount} sem geometria.</dd></div>
    </dl>
    {data.sheet.ambiguousCodes>0&&<details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30"><summary className="cursor-pointer font-semibold text-amber-950 dark:text-amber-100">Conferir vínculos duplicados ({data.sheet.ambiguousCodes} códigos)</summary><div className="mt-2 space-y-3">{data.sheet.ambiguousExamples.map(group=><div key={group.code}><strong>{group.code}</strong><ul className="mt-1 space-y-1 text-amber-950 dark:text-amber-100">{group.rows.map(row=><li key={`${row.sheet}:${row.row}`}>{row.sheet} · linha {row.row} — {row.originalName}; OLT {row.olt??'não informada'} · VLAN/PON {row.pon??'não informada'} · split {row.capacity??'—'} · {row.available===null?'vagas não confirmadas':`${row.available} ${row.available===1?'vaga':'vagas'}`}</li>)}</ul></div>)}{data.sheet.ambiguousCodes>data.sheet.ambiguousExamples.length&&<p>Exibindo {data.sheet.ambiguousExamples.length} dos {data.sheet.ambiguousCodes} códigos duplicados. Os demais ficam sinalizados nas consultas individuais.</p>}</div></details>}
    {data.fiberDocs.missingCables.length>0&&<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><strong>Corrigir no FiberDocs:</strong><ul className="mt-1 space-y-1">{data.fiberDocs.missingCables.map(cable=><li key={cable.id}>Cabo sem geometria: {cable.name} (IXC #{cable.id})</li>)}</ul>{data.fiberDocs.missingCableCount>data.fiberDocs.missingCables.length&&<p className="mt-1">Mais {data.fiberDocs.missingCableCount-data.fiberDocs.missingCables.length} cabos não listados.</p>}</div>}
    {data.fiberDocs.issues.length>0&&<ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">{describeFiberDocsIssues(data.fiberDocs.issues).map(message=><li key={message}>{message}</li>)}</ul>}
  </article>;
}
function Result({decision,boxes,leadId,address}:{decision:Decision;boxes:Box[];leadId:number|null;address:string}) {
  const [visibleCount,setVisibleCount]=useState(10);
  const [copied,setCopied]=useState(false);const [copyError,setCopyError]=useState('');
  const candidates=[...decision.candidates].sort((a,b)=>(a.geographicMeters??Infinity)-(b.geographicMeters??Infinity)||a.ctoId.localeCompare(b.ctoId));
  const recommended=decision.candidates.find(candidate=>candidate.ctoId===decision.recommendedCtoId);
  const activityText=buildTechnicalActivityText(decision,{address,leadId});
  const ctoNames=new Map(boxes.map(box=>[box.id,box.name]));
  const Icon=decision.status==='VIAVEL'?CheckCircle2:decision.status==='INVIAVEL'?XCircle:CircleAlert;
  return <div className="space-y-4">
    <div className={`flex flex-wrap items-start justify-between gap-4 rounded-xl border p-5 ${tones[decision.status]}`}>
      <div className="flex items-start gap-3"><Icon size={25}/><div>
        <h3 className="text-xl font-bold">{names[decision.status]} {decision.origin==='DEMO'&&<span className="text-xs font-medium">na demonstração</span>}</h3>
        <p className="mt-2 text-sm">{decision.recommendedCtoId?`CTO indicada: ${decision.recommendedCtoId}`:decision.reasons.length?reason(decision.reasons[0]!):'As CTOs candidatas não atendem aos critérios.'}</p>
      {recommended?.routeSource==='FIBERDOCS_ESTIMATE'&&<p className="mt-2 max-w-xl text-xs leading-relaxed">Rota estimada automaticamente pela geometria FiberDocs, com 20 m de reserva. A equipe confirma a passagem e as condições de instalação em campo.</p>}
        {recommended?.routeSource==='OSM_ESTIMATE'&&<p className="mt-2 max-w-xl text-xs leading-relaxed">Estimativa pelas ruas do OpenStreetMap, com 20 m de reserva. Não confirma fibra nem passagem física; a CTO permanece em análise técnica.</p>}
        <p className="mt-2 text-xs opacity-80">{date(decision.evaluatedAt)} · Consulta {decision.id.slice(0,8)}</p>
      </div></div>
      <button type="button" aria-label="Exportar resultado" onClick={()=>exportJson(decision,'viabilidade-'+decision.id+'.json')} className="rounded-lg border border-current/20 p-2"><Download size={18}/></button>
    </div>
    <section data-testid="technical-activity" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900" aria-labelledby="technical-activity-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 id="technical-activity-heading" className="text-lg font-semibold">Ficha técnica pronta</h4><p className="mt-1 text-sm text-slate-500">{leadId?`Preparada para o lead #${leadId}; copie para registrar a atividade.`:'Resumo pronto para copiar para a atividade de instalação.'}</p></div><button type="button" onClick={()=>{void navigator.clipboard.writeText(activityText).then(()=>{setCopied(true);setCopyError('')}).catch(()=>{setCopied(false);setCopyError('O navegador bloqueou a área de transferência. Selecione e copie o texto abaixo.')})}} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700 dark:hover:bg-zinc-800"><Copy size={16}/>Copiar ficha técnica</button></div>
      <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-800 dark:bg-zinc-950 dark:text-zinc-200">{activityText}</pre>
      {copied&&<p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Ficha técnica copiada.</p>}{copyError&&<p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{copyError}</p>}
    </section>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h4 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold dark:border-zinc-800">CTOs candidatas <span className="font-normal text-slate-500">({decision.candidates.length})</span></h4>
      {candidates.slice(0,visibleCount).map(c=>{
        const missingSheetMatch=c.reasons.includes('CTO_AMBIGUA')?'Associação ambígua':c.reasons.includes('CTO_AUSENTE_NA_PLANILHA')?'CTO não localizada':null;
        return <div data-cto-card key={c.ctoId} className="border-b border-slate-100 p-5 last:border-0 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <strong className="text-sm">{ctoNames.get(c.ctoId)||c.ctoId}<span className="ml-2 font-normal text-slate-500">IXC #{c.ctoId}</span></strong>
              {c.sheetCtoName&&<p className="mt-1 text-xs text-slate-500 dark:text-zinc-400"><span className="font-semibold text-slate-700 dark:text-zinc-300">Planilha:</span> {c.sheetCtoName}{c.sheet&&<span> · {c.sheet} · linha {c.row}</span>}</p>}
              {!c.sheetCtoName&&missingSheetMatch&&<p className="mt-1 text-xs text-amber-700 dark:text-amber-300"><span className="font-semibold">Planilha:</span> {missingSheetMatch}</p>}
              {(c.sheetMatches?.length??0)>1&&<ul className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><li className="mb-1 font-semibold">Linhas da planilha em conflito; não some as vagas:</li>{c.sheetMatches.map(match=><li key={`${match.sheet}:${match.row}`}>{match.sheet} · linha {match.row} — OLT {match.olt??'—'} · VLAN/PON {match.pon??'—'} · split {match.capacity??'—'} · {match.available===null?'vagas não confirmadas':`${match.available} ${match.available===1?'vaga':'vagas'}`}</li>)}</ul>}
            </div>
            <StatusBadge status={c.status}/>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-5">{[['Linha reta',meters(c.geographicMeters)],[routeLabel(c.routeSource),meters(c.routeMeters)],['Vagas na planilha',c.available===null?'Não conferidas':String(c.available)],['Capacidade (IXC / planilha)',c.ixcCapacity===null&&c.sheetCapacity===null?'Não informada':`${c.ixcCapacity??'—'} / ${c.sheetCapacity??'—'}`],['Atualização',c.updatedOn?c.updatedOn.split('-').reverse().join('/'):'Não conferida']].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>)}</dl>
          {c.routeComponents&&<dl aria-label="Composição da rota" className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-zinc-950 sm:grid-cols-3"><div><dt className="text-slate-500">Trecho pelas ruas/rede</dt><dd className="mt-1 font-semibold tabular-nums">{meters(c.routeComponents.lineMeters)}</dd></div><div><dt className="text-slate-500">Acesso do imóvel</dt><dd className="mt-1 font-semibold tabular-nums">{meters(c.routeComponents.installAccessMeters)}</dd></div><div><dt className="text-slate-500">Acesso da CTO</dt><dd className="mt-1 font-semibold tabular-nums">{meters(c.routeComponents.ctoAccessMeters)}</dd></div><div><dt className="text-slate-500">Reserva</dt><dd className="mt-1 font-semibold tabular-nums">{meters(c.routeComponents.reserveMeters)}</dd></div><div><dt className="text-slate-500">Total calculado</dt><dd className="mt-1 font-semibold tabular-nums">{meters(c.routeComponents.totalMeters)}</dd></div></dl>}
          {c.routeSource==='OSM_ESTIMATE'&&<p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">Fonte: vias mapeadas no OpenStreetMap. Estimativa sujeita a análise técnica; não comprova cabo, ocupação, autorização ou instalação.</p>}
          {c.routeSource==='FIBERDOCS_ESTIMATE'&&c.routeMeters!==null&&c.routeMeters<=500&&c.available!==null&&c.available>0&&c.status!=='VIAVEL'&&<p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><strong>Rota encontrada:</strong> {meters(c.routeMeters)} pela rede FiberDocs, dentro do limite. A CTO continua em análise porque {c.reasons.includes('CAPACIDADE_DIVERGENTE')?`a capacidade diverge (IXC ${c.ixcCapacity??'—'}; planilha ${c.sheetCapacity??'—'}).`:'há outro dado técnico pendente.'}</p>}
          {c.reasons.length>0&&<ul className="mt-4 space-y-1 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{[...new Set(c.reasons.map(reason))].map(text=><li key={text}>• {text}</li>)}</ul>}
        </div>;
      })}
      {visibleCount<candidates.length&&<div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-zinc-800"><span className="text-xs text-slate-500">Exibindo {Math.min(visibleCount,candidates.length)} de {candidates.length}, por proximidade. A exportação contém a avaliação completa.</span><button type="button" onClick={()=>setVisibleCount(count=>count+10)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700">Mostrar mais CTOs</button></div>}
      {!decision.candidates.length&&<p className="p-5 text-sm text-slate-500">Nenhuma CTO ativa na fonte desta região.</p>}
    </div>
  </div>;
}
