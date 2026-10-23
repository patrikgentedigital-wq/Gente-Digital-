'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { distanceMeters } from '@/lib/viabilidade/domain/distance';
import type { Candidate, RouteGeometry } from '@/lib/viabilidade/domain/types';
import type { FiberNetwork } from '@/lib/viabilidade/domain/network-path';
import { describeFiberDocsIssues } from '@/lib/viabilidade/fiberdocs-issues';
import { parseNetworkKml } from '@/lib/viabilidade/kml';

type Point = { latitude: number; longitude: number };
type Box = { id: string; name: string; location: Point | null };
type CandidateBox = Box & { location: Point; meters: number };

const TILE_URL = process.env.NEXT_PUBLIC_VIABILITY_MAP_TILE_URL?.trim()
  || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_VIABILITY_MAP_ATTRIBUTION?.trim()
  || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
function ctoIcon(number: number, recommended: boolean) {
  return L.divIcon({
    className: `viability-map-marker${recommended ? ' viability-map-marker--recommended' : ''}`,
    html: `<span aria-hidden="true">${number}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const installIcon = L.divIcon({
  className: 'viability-map-marker viability-map-marker--install',
  html: '<span aria-hidden="true"><i></i></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function PickPoint({ onChange }: { onChange?: (point: Point) => void }) {
  useMapEvents({ click: event => onChange?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return null;
}

function FitBounds({ point, boxes, inspectionPath, editing }: { point: Point; boxes: CandidateBox[]; inspectionPath?: Point[]; editing?: boolean }) {
  const map = useMap();
  const fitted = useRef(false);
  const positions: LatLngBoundsExpression = useMemo(() => {
    if(inspectionPath?.length)return [
      [point.latitude,point.longitude],
      ...inspectionPath.map(p=>[p.latitude,p.longitude] as [number,number]),
    ];
    const radiusLat = 500 / 111_320;
    const radiusLon = 500 / (111_320 * Math.cos(point.latitude * Math.PI / 180));
    return [
      [point.latitude - radiusLat, point.longitude - radiusLon],
      [point.latitude + radiusLat, point.longitude + radiusLon],
      ...boxes.map(box => [box.location.latitude, box.location.longitude] as [number, number]),
    ];
  }, [point.latitude, point.longitude, boxes, inspectionPath]);

  useEffect(() => {
    if(fitted.current&&editing&&!inspectionPath?.length&&!boxes.length&&map.getBounds().contains([point.latitude,point.longitude]))return;
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: inspectionPath?.length?18:17, animate: false });
    fitted.current=true;
  }, [map, positions, inspectionPath, editing, boxes.length, point.latitude, point.longitude]);

  return null;
}

export default function CoverageMap({
  boxes,
  point,
  recommended,
  network,
  routeGeometries = [],
  routeCandidates = [],
  selectionKey = null,
  roadGraphUpdatedAt,
  onPointChange,
  sourcesConsulted = true,
}: {
  boxes: Box[];
  point: Point | null;
  recommended: string | null;
  network?: FiberNetwork | null;
  routeGeometries?: RouteGeometry[];
  routeCandidates?: Candidate[];
  selectionKey?: string | null;
  roadGraphUpdatedAt?: string;
  onPointChange?: (point: Point) => void;
  sourcesConsulted?: boolean;
}) {
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [imported,setImported]=useState<FiberNetwork|null>(null);
  const [importError,setImportError]=useState('');
  const [manualRouteSelection,setManualRouteSelection]=useState<{selectionKey:string|null;ctoId:string}|null>(null);
  const [showPoles,setShowPoles]=useState(true),[showCables,setShowCables]=useState(true);
  const latitude = point?.latitude;
  const longitude = point?.longitude;
  const withinRadius = useMemo<CandidateBox[]>(() => {
    if (latitude === undefined || longitude === undefined) return [];
    const installPoint = { latitude, longitude };
    return boxes
      .filter((box): box is Box & { location: Point } => box.location !== null)
      .map(box => ({ ...box, meters: distanceMeters(installPoint, box.location) }))
      .filter(box => box.meters <= 500)
      .sort((a, b) => a.meters - b.meters)
  }, [boxes, latitude, longitude]);
  const routeDefaultId = useMemo(() => recommended ?? [...routeCandidates]
    .sort((a, b) => (a.routeMeters ?? Infinity) - (b.routeMeters ?? Infinity)
      || (a.geographicMeters ?? Infinity) - (b.geographicMeters ?? Infinity)
      || a.ctoId.localeCompare(b.ctoId))[0]?.ctoId ?? null, [recommended, routeCandidates]);
  const nearest = useMemo(() => {
    const firstTen = withinRadius.slice(0, 10);
    const recommendedBox = withinRadius.find(box => box.id === recommended);
    const routeDefaultBox = withinRadius.find(box => box.id === routeDefaultId);
    const firstRoutedBox = withinRadius.find(box => box.id === routeGeometries[0]?.ctoId);
    const extras = [recommendedBox, routeDefaultBox, firstRoutedBox].filter((box): box is CandidateBox => box !== undefined
      && !firstTen.some(item => item.id === box.id));
    return [...firstTen, ...extras.filter((box, index) => extras.findIndex(item => item.id === box.id) === index)];
  }, [withinRadius, recommended, routeDefaultId, routeGeometries]);
  const cables=useMemo(()=>imported?.cables??network?.cables??[],[imported,network]);
  const poles=useMemo(()=>[...(network?.poles??[]),...(imported?.poles??[])],[network,imported]);
  const manualCtoId=manualRouteSelection?.selectionKey===selectionKey?manualRouteSelection.ctoId:null;
  const selected=nearest.find(box=>box.id===manualCtoId)??nearest.find(box=>box.id===routeDefaultId)??nearest.find(box=>box.id===routeGeometries[0]?.ctoId)??nearest[0];
  const selectedRoute=routeGeometries.find(route=>route.ctoId===selected?.id)??null;
  const selectedCandidate=routeCandidates.find(candidate=>candidate.ctoId===selected?.id);
  const poleCount=network?.poles.length??0;
  const cableCount=network?.cableCount??0;
  const networkStatus=!sourcesConsulted ? 'CTOs e cabos serão carregados ao consultar a viabilidade.' : network
    ? `${poleCount} ${poleCount===1?'poste com coordenada':'postes com coordenadas'} · ${cables.length} de ${cableCount} ${cableCount===1?'cabo com geometria':'cabos com geometria'}${network.complete?'':' · leitura parcial'}.`
    : 'Leitura automática do FiberDocs indisponível.';
  const networkIssues=describeFiberDocsIssues(network?.issues??[]);
  async function importKml(file:File|undefined){
    if(!file)return;setImportError('');
    try{if(file.size>5_000_000)throw new Error('KML inválido ou maior que 5 MB.');setImported(parseNetworkKml(await file.text()));}
    catch(e){setImported(null);setImportError((e as Error).message);}
  }

  if (!point) {
    return <section aria-labelledby="coverage-map-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
        <h3 id="coverage-map-title" className="text-sm font-semibold">Mapa de ruas e CTOs</h3>
        <span className="text-xs text-slate-500">Raio geográfico: 500 m</span>
      </div>
      <div className="grid min-h-64 place-items-center bg-slate-50 px-6 text-center dark:bg-[#14202b]">
        <div><p className="font-medium">Localize o endereço para abrir o mapa</p><p className="mt-2 max-w-md text-sm text-slate-500 dark:text-zinc-400">Busque a rua e confirme o imóvel no mapa. A opção de coordenadas também está disponível.</p></div>
      </div>
      <p className="border-t border-slate-200 px-5 py-3 text-xs leading-relaxed text-slate-500 dark:border-zinc-800 dark:text-zinc-400">Localize e confirme o imóvel. A consulta carregará as CTOs, vagas e cabos cadastrados.</p>
    </section>;
  }

  const center: [number, number] = [point.latitude, point.longitude];
  return <section aria-labelledby="coverage-map-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
      <div><h3 id="coverage-map-title" className="text-sm font-semibold">Mapa de ruas e CTOs</h3><p className="mt-1 text-xs text-slate-500">{!sourcesConsulted ? 'Prévia da localização do imóvel' : withinRadius.length ? `${withinRadius.length} CTO${withinRadius.length === 1 ? '' : 's'} com coordenada no raio${withinRadius.length > 10 ? ' · mostrando as 10 mais próximas' : ''}` : 'Nenhuma CTO com coordenada no raio'}</p></div>
      <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Raio geográfico: 500 m</span>
    </div>
    <div className="space-y-3 border-b border-slate-200 px-5 py-4 text-xs dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showPoles} onChange={e=>setShowPoles(e.target.checked)}/>Postes FiberDocs</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showCables} onChange={e=>setShowCables(e.target.checked)}/>Cabos FiberDocs</label>
        <label className="ml-auto flex flex-wrap items-center gap-2 font-medium">KML de conferência<input aria-label="Importar KML do FiberDocs" type="file" accept=".kml,application/vnd.google-earth.kml+xml" className="max-w-56 text-xs file:mr-2 file:rounded file:border-0 file:bg-[#fff8c2] file:px-2 file:py-1 file:text-[#0e1b2c] dark:file:bg-[#17263b] dark:file:text-[#e8eef5]" onChange={e=>{void importKml(e.target.files?.[0]);e.target.value='';}}/></label>
      </div>
      <p className="text-slate-500 dark:text-zinc-400">{networkStatus} {imported?`KML de conferência carregado nesta sessão: ${imported.cables.length} cabo(s), ${imported.poles.length} ponto(s).`:''} {networkIssues.join(' ')}</p>
      <p className="text-slate-500 dark:text-zinc-400">Cabos e postes são consultados automaticamente no FiberDocs. O KML é apenas uma conferência local quando a fonte estiver incompleta.</p>
      {importError&&<p role="alert" className="text-rose-700 dark:text-rose-300">{importError}</p>}
      {(cables.length>0||routeGeometries.length>0)&&<div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2">CTO para rota<select aria-label="CTO para rota" value={selected?.id??''} onChange={e=>setManualRouteSelection({selectionKey,ctoId:e.target.value})} className="max-w-56 rounded border border-slate-300 bg-transparent p-2 dark:border-zinc-700">{nearest.map(box=><option key={box.id} value={box.id}>{box.name}</option>)}</select></label><span className="text-amber-800 dark:text-amber-300">{selectedRoute?.source==='OSM_ESTIMATE'?`Rota estimada pelas ruas OSM: ${Math.round(selectedCandidate?.routeMeters??0)} m incluindo 20 m de reserva. A linha mostra ruas e acessos; a fibra e a passagem física exigem conferência técnica.`:selectedRoute?.source==='FIBERDOCS_ESTIMATE'?`Rota FiberDocs estimada: ${Math.round(selectedCandidate?.routeMeters??0)} m, incluindo os acessos e 20 m de reserva. A continuidade e a passagem física exigem confirmação em campo.`:'Não há caminho calculado para esta CTO. A linha reta mostra somente proximidade.'}</span>{imported&&<button type="button" onClick={()=>setImported(null)} className="rounded border border-slate-300 px-2 py-1 dark:border-zinc-700">Remover KML</button>}</div>}
    </div>
    <div className="relative">
      <div role="application" aria-label="Mapa de ruas, ponto de instalação e CTOs" className="relative">
      <MapContainer
        key={`${point.latitude}:${point.longitude}`}
        center={center}
        zoom={16}
        minZoom={12}
        maxZoom={19}
        scrollWheelZoom={false}
        className="h-[320px] w-full sm:h-[390px]"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} eventHandlers={{
          tileerror: () => setTilesUnavailable(true),
          tileload: () => setTilesUnavailable(false),
        }}/>
        <FitBounds point={point} boxes={nearest} inspectionPath={selectedRoute?.points} editing={Boolean(onPointChange)}/>
        <PickPoint onChange={onPointChange}/>
        <Circle center={center} radius={500} pathOptions={{ color: '#d97706', weight: 2, dashArray: '6 5', fillColor: '#f59e0b', fillOpacity: 0.08 }}/>
        {showCables&&cables.map(cable=><Polyline key={cable.id} positions={cable.points.map(p=>[p.latitude,p.longitude])} pathOptions={{color:'#7c3aed',weight:3}}><Popup><strong>{cable.name}</strong><br/>Geometria do FiberDocs; conexão física não confirmada.</Popup></Polyline>)}
        {selectedRoute&&<Polyline positions={selectedRoute.points.map(p=>[p.latitude,p.longitude])} pathOptions={{color:selectedRoute.source==='OSM_ESTIMATE'?'#dc2626':'#0d9488',weight:5,dashArray:selectedRoute.source==='OSM_ESTIMATE'?'4 7':'8 5'}}><Popup>{selectedRoute.source==='OSM_ESTIMATE'?`Rota estimada pelas ruas OSM: ${Math.round(selectedCandidate?.routeMeters??0)} m incluindo reserva. A linha não comprova fibra nem passagem.`:`Rota FiberDocs estimada: ${Math.round(selectedCandidate?.routeMeters??0)} m incluindo reserva. Confirme passagem em campo.`}</Popup></Polyline>}
        {showPoles&&poles.filter(p=>distanceMeters(point,p.location)<=1000).map(pole=><CircleMarker key={pole.id} center={[pole.location.latitude,pole.location.longitude]} radius={4} pathOptions={{color:'#475569',fillColor:'#fff',fillOpacity:1,weight:2}}><Popup><strong>{pole.name}</strong><br/>Ponto cadastrado; uso para instalação depende de conferência.</Popup></CircleMarker>)}
        <Marker position={center} icon={installIcon} title="Ponto de instalação" alt="Ponto de instalação" zIndexOffset={1000} draggable={Boolean(onPointChange)} eventHandlers={{dragend:event=>{const position=event.target.getLatLng();onPointChange?.({latitude:position.lat,longitude:position.lng})}}}>
          <Popup><strong>Ponto de instalação</strong><br/>{onPointChange?'Arraste este ponto até o imóvel e confirme a localização.':'Ponto escolhido para a instalação.'}</Popup>
        </Marker>
        {nearest.map((box, index) => {
          const isRecommended = box.id === recommended;
          const title = `${box.name} — ${Math.round(box.meters).toLocaleString('pt-BR')} m em linha reta${isRecommended ? ' — recomendada pela análise' : ''}`;
          return <Marker key={box.id} position={[box.location.latitude, box.location.longitude]} icon={ctoIcon(index + 1, isRecommended)} title={title} alt={title}>
            <Popup><strong>{box.name}</strong><br/>IXC #{box.id}<br/><span>{Math.round(box.meters).toLocaleString('pt-BR')} m em linha reta</span>{isRecommended&&<><br/><strong>Recomendada pela análise</strong></>}</Popup>
          </Marker>;
        })}
      </MapContainer>
      </div>
      {tilesUnavailable&&<div role="status" className="absolute left-3 right-3 top-3 z-[1000] rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-100">O mapa de ruas não carregou; os marcadores e o raio continuam disponíveis.</div>}
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-600 dark:border-zinc-800 dark:text-zinc-300">
      <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full border-2 border-white bg-[#0e1b2c] shadow"/>Ponto de instalação</span>
      <span className="inline-flex items-center gap-2"><i className="grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-slate-700 text-xs font-bold text-white shadow">1</i>CTO; selecione para detalhes</span>
      {nearest.some(box => box.id === recommended)&&<span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-emerald-600"/>Recomendada</span>}
      {cables.length>0&&<span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-violet-700"/>Cabos FiberDocs</span>}
      {routeGeometries.some(route=>route.source==='FIBERDOCS_ESTIMATE')&&<span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-teal-600"/>Rota FiberDocs estimada</span>}
      {routeGeometries.some(route=>route.source==='OSM_ESTIMATE')&&<span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-red-600"/>Rota estimada pelas ruas (OSM) · {roadGraphUpdatedAt?new Date(roadGraphUpdatedAt).toLocaleDateString('pt-BR'):'data não registrada'}</span>}
    </div>
    <p className="border-t border-slate-200 px-5 py-3 text-xs leading-relaxed text-slate-500 dark:border-zinc-800 dark:text-zinc-400">{routeGeometries.some(route=>route.source==='OSM_ESTIMATE')?'A rota OSM é calculada no servidor sobre vias públicas mapeadas e pode divergir da passagem física. A linha mostra ruas e acessos; os 20 m de reserva entram somente na metragem total. Fonte dos dados viários: OpenStreetMap contributors.':routeGeometries.length?'A rota e a metragem vêm do mesmo cálculo no servidor. Os acessos até a rede são limitados a 30 m por ponta; a reserva de fibra não é desenhada. A passagem física exige conferência.':cables.length>0?'Os cabos e postes FiberDocs são camadas de referência; cruzamentos sem conexão cadastrada permanecem desconectados. Não há rota estimada até a CTO selecionada.':!sourcesConsulted?'Confirme o ponto de instalação e consulte a viabilidade para carregar as fontes.':'Sem geometria de rota calculada. O círculo e os marcadores mostram proximidade geográfica, não o caminho do cabo.'} {routeGeometries.some(route=>route.source==='OSM_ESTIMATE')&&<a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Atribuição OSM</a>} O provedor do mapa recebe a área aproximada exibida.</p>
  </section>;
}
