import type { Point } from './domain/types';
import type { FiberNetwork } from './domain/network-path';

// Browser only. NetworkLink, descriptions, HTML and external icons are never loaded.
export function parseNetworkKml(text:string):FiberNetwork {
  if(text.length>5_000_000||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('KML inválido ou maior que 5 MB.');
  const xml=new DOMParser().parseFromString(text,'application/xml');
  if(xml.getElementsByTagName('parsererror').length||xml.documentElement.localName!=='kml')throw new Error('Selecione um arquivo KML válido exportado pelo FiberDocs.');
  const find=(el:Element,tag:string)=>Array.from(el.getElementsByTagNameNS('*',tag));
  const result:FiberNetwork={poles:[],cables:[],cableCount:0,complete:false,issues:['KML_ESCOPO_NAO_VALIDADO','CONEXAO_FISICA_NAO_CONFIRMADA'],fetchedAt:new Date().toISOString()};
  let vertices=0;
  function coordinates(el:Element):Point[]{
    const raw=find(el,'coordinates')[0]?.textContent?.trim();
    if(!raw)throw new Error('Elemento KML sem coordenadas.');
    return raw.split(/\s+/).map(tuple=>{
      if(++vertices>5000)throw new Error('Exporte uma área menor: limite de 5.000 pontos.');
      const parts=tuple.split(',');
      if(parts.length<2||parts.slice(0,2).some(v=>! /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(v!)))throw new Error('Coordenada KML inválida.');
      const longitude=Number(parts[0]),latitude=Number(parts[1]);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error('Coordenada KML fora do intervalo.');
      return {latitude,longitude};
    });
  }
  for(const [index,placemark] of find(xml.documentElement,'Placemark').entries()){
    const name=(find(placemark,'name')[0]?.textContent||'Elemento '+(index+1)).slice(0,160);
    for(const [lineIndex,line] of find(placemark,'LineString').entries()){
      const points=coordinates(line);if(points.length<2)throw new Error('Cabo KML sem dois pontos.');
      result.cables.push({id:`kml-${index}-${lineIndex}`,name,points});
    }
    for(const [pointIndex,point] of find(placemark,'Point').entries()){
      const values=coordinates(point);if(values.length!==1)throw new Error('Ponto KML inválido.');
      result.poles.push({id:`kml-point-${index}-${pointIndex}`,name,location:values[0]!});
    }
  }
  if(!result.poles.length&&!result.cables.length)throw new Error('O KML não contém pontos ou cabos.');
  result.cableCount=result.cables.length;return result;
}
