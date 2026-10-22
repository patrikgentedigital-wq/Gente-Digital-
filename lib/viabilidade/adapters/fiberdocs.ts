import type { FetchLike } from './ports';
import type { Region } from '../domain/types';
import type { FiberNetwork } from '../domain/network-path';

type Options={baseUrl:string;token:string;projects:Record<Region,string[]>;pageSize?:number};
type Coordinates={latitude:number;longitude:number};
type CoordinateRow={elementId:string;coordinateId:string|null;point:Coordinates|null;order:number;id:string};

const coordinatePattern=/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const maxVertices=25_000;

function parseCoordinates(value:unknown,minimum:number):Coordinates[]|null {
  let input=value;
  if(typeof input==='string'){
    const text=input;
    try{input=JSON.parse(text);}catch{
      const pair=text.split(/[,;\s]+/).filter(Boolean);
      if(pair.length!==2)return null;
      input=pair;
    }
  }
  if(Array.isArray(input)&&input.length>=2&&!Array.isArray(input[0]))input=[input];
  if(!Array.isArray(input)||input.length<minimum)return null;
  const points:Coordinates[]=[];
  for(const pair of input){
    if(!Array.isArray(pair)||pair.length<2)return null;
    const [rawLatitude,rawLongitude]=pair;
    if((typeof rawLatitude!=='number'&&typeof rawLatitude!=='string')
      ||(typeof rawLongitude!=='number'&&typeof rawLongitude!=='string')
      ||(typeof rawLatitude==='string'&&!coordinatePattern.test(rawLatitude.trim()))
      ||(typeof rawLongitude==='string'&&!coordinatePattern.test(rawLongitude.trim())))return null;
    const latitude=Number(rawLatitude),longitude=Number(rawLongitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;
    points.push({latitude,longitude});
  }
  return points;
}

function scalarCoordinate(row:Record<string,unknown>,names:string[]):number|null {
  for(const name of names){
    const value=row[name];
    if((typeof value==='number'||typeof value==='string')
      &&(typeof value!=='string'||coordinatePattern.test(value.trim()))){
      const number=Number(value);
      if(Number.isFinite(number))return number;
    }
  }
  return null;
}

function coordinatePoint(row:Record<string,unknown>):Coordinates|null {
  for(const field of ['coordenadas','coordenada','ponto']){
    const parsed=parseCoordinates(row[field],1);
    if(parsed)return parsed[0]!;
  }
  const latitude=scalarCoordinate(row,['latitude','lat','coordenada_latitude','coord_y','y']);
  const longitude=scalarCoordinate(row,['longitude','lng','lon','coordenada_longitude','coord_x','x']);
  if(latitude===null||longitude===null||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;
  return {latitude,longitude};
}

function coordinateRow(raw:Record<string,unknown>):CoordinateRow|null {
  const rawElementId=raw.id_elemento??raw.elemento_id??raw.id_df_elemento;
  const rawId=raw.id;
  if(!/^[1-9]\d*$/.test(String(rawElementId))||!/^[1-9]\d*$/.test(String(rawId)))return null;
  const point=coordinatePoint(raw);
  const rawCoordinateId=raw.id_coordenada??raw.coordenada_id??raw.id_df_coordenada;
  const coordinateId=/^[1-9]\d*$/.test(String(rawCoordinateId))?String(rawCoordinateId):null;
  if(!point&&!coordinateId)return null;
  const rawOrder=raw.ordem??raw.ordem_ponto??raw.sequencia??raw.sequencia_coordenada??raw.posicao??raw.indice??raw.index;
  const order=rawOrder!==undefined&&rawOrder!==null&&String(rawOrder).trim()!==''?Number(rawOrder):Number(rawId);
  if(!Number.isFinite(order))return null;
  return {elementId:String(rawElementId),id:String(rawId),coordinateId,point,order};
}

export function createFiberDocsSource(options:Options,fetcher:FetchLike=fetch) {
  const base=new URL(options.baseUrl);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!['/','/webservice/v1','/webservice/v1/'].includes(base.pathname)
    || !/^[1-9]\d*:[^\s:]+$/.test(options.token))throw new Error('FIBERDOCS_CONFIGURATION_INVALID');
  const size=options.pageSize??400;
  if(!Number.isSafeInteger(size)||size<1||size>400)throw new Error('FIBERDOCS_CONFIGURATION_INVALID');
  for(const region of ['AC','CP'] as const)if(!options.projects[region]?.length||options.projects[region].some(id=>! /^[1-9]\d*$/.test(id)))throw new Error('FIBERDOCS_CONFIGURATION_INVALID');
  if(options.projects.AC.some(id=>options.projects.CP.includes(id)))throw new Error('FIBERDOCS_CONFIGURATION_INVALID');
  const endpoint=new URL('/webservice/v1/df_elemento',base.origin);
  const coordinateEndpoint=new URL('/webservice/v1/df_elemento_coordenada',base.origin);
  const coordinateDataEndpoint=new URL('/webservice/v1/df_coordenada',base.origin);
  const authorization='Basic '+Buffer.from(options.token).toString('base64');
  return async(region:Region):Promise<FiberNetwork>=>{
    const empty:FiberNetwork={poles:[],cables:[],cableCount:0,complete:false,issues:[],fetchedAt:new Date().toISOString()};
    const projects=options.projects[region];
    if(!projects)return {...empty,issues:['FIBERDOCS_REGION_INVALID']};
    const signal=AbortSignal.timeout(25_000);
    let coordinateFields:string[]|undefined,coordinateDataFields:string[]|undefined;
    async function listElements(type:'PT'|'CB') {
      const rows:Record<string,unknown>[]=[];const ids=new Set<string>();let expected:number|null=null;
      for(let page=1;page<=50;page++){
        const response=await fetcher(endpoint,{method:'POST',headers:{authorization,ixcsoft:'listar','content-type':'application/json'},redirect:'error',signal,
          body:JSON.stringify({qtype:'df_elemento.tipo',query:type,oper:'=',page:String(page),rp:String(size),sortname:'df_elemento.id',sortorder:'asc',
            grid_param:JSON.stringify([{TB:'df_elemento.id_projeto',OP:'IN',P:projects.join(',')}])})});
        if(!response.ok)throw new Error('FIBERDOCS_ELEMENTS_READ_REFUSED');
        const payload=await response.json();
        const total=Number(payload.total);
        if(payload.type==='error'||!/^(0|[1-9]\d*)$/.test(String(payload.total))||!Number.isSafeInteger(total)||total>20_000||Number(payload.page)!==page||!Array.isArray(payload.registros)
          ||(expected!==null&&total!==expected)||payload.registros.length!==Math.min(size,Math.max(0,total-(page-1)*size)))throw new Error('FIBERDOCS_ELEMENTS_SCHEMA_OR_PAGE_INVALID');
        expected=total;
        for(const raw of payload.registros){
          if(!raw||typeof raw!=='object'||Array.isArray(raw)||! /^[1-9]\d*$/.test(String(raw.id))||ids.has(String(raw.id))||!projects.includes(String(raw.id_projeto))||raw.tipo!==type)throw new Error('FIBERDOCS_ELEMENTS_SCOPE_OR_SCHEMA_INVALID');
          ids.add(String(raw.id));rows.push(raw);
        }
        if(rows.length===total)return rows;
      }
      throw new Error('FIBERDOCS_ELEMENTS_PAGE_LIMIT');
    }
    async function listCoordinateRows(elementIds:string[]):Promise<CoordinateRow[]> {
      const result:CoordinateRow[]=[];const seen=new Set<string>();
      for(let start=0;start<elementIds.length;start+=200){
        const batch=elementIds.slice(start,start+200);let expected:number|null=null;let received=0;
        for(let page=1;page<=50;page++){
          const response=await fetcher(coordinateEndpoint,{method:'POST',headers:{authorization,ixcsoft:'listar','content-type':'application/json'},redirect:'error',signal,
            body:JSON.stringify({qtype:'df_elemento_coordenada.id_elemento',query:batch.join(','),oper:'IN',page:String(page),rp:String(size),sortname:'df_elemento_coordenada.id',sortorder:'asc'})});
          if(!response.ok)throw new Error(`FIBERDOCS_COORDINATES_HTTP_${response.status}`);
          const payload=await response.json();const total=Number(payload.total);
          if(payload.type==='error'||!/^(0|[1-9]\d*)$/.test(String(payload.total))||!Number.isSafeInteger(total)||total>maxVertices||Number(payload.page)!==page||!Array.isArray(payload.registros)
            ||(expected!==null&&total!==expected)||payload.registros.length!==Math.min(size,Math.max(0,total-(page-1)*size)))throw new Error('FIBERDOCS_COORDINATES_SCHEMA_OR_PAGE_INVALID');
          expected=total;
          for(const raw of payload.registros){
            if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('FIBERDOCS_COORDINATES_SCHEMA_INVALID');
            const parsed=coordinateRow(raw);
            if(!parsed){coordinateFields=Object.keys(raw).filter(key=>/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)).sort().slice(0,40);throw new Error('FIBERDOCS_COORDINATES_ROW_SHAPE_INVALID');}
            if(!batch.includes(parsed.elementId))throw new Error('FIBERDOCS_COORDINATES_SCOPE_INVALID');
            if(seen.has(parsed.id))throw new Error('FIBERDOCS_COORDINATES_DUPLICATE_ROW');
            seen.add(parsed.id);result.push(parsed);
          }
          received+=payload.registros.length;
          if(received===total)break;
          if(page===50)throw new Error('FIBERDOCS_COORDINATES_PAGE_LIMIT');
        }
      }
      return result;
    }
    async function listCoordinatePoints(coordinateIds:string[]):Promise<Map<string,Coordinates>> {
      const result=new Map<string,Coordinates>();
      for(let start=0;start<coordinateIds.length;start+=200){
        const batch=coordinateIds.slice(start,start+200);let expected:number|null=null;let received=0;
        for(let page=1;page<=50;page++){
          const response=await fetcher(coordinateDataEndpoint,{method:'POST',headers:{authorization,ixcsoft:'listar','content-type':'application/json'},redirect:'error',signal,
            body:JSON.stringify({qtype:'df_coordenada.id',query:batch.join(','),oper:'IN',page:String(page),rp:String(size),sortname:'df_coordenada.id',sortorder:'asc'})});
          if(!response.ok)throw new Error(`FIBERDOCS_COORDINATE_DATA_HTTP_${response.status}`);
          const payload=await response.json();const total=Number(payload.total);
          if(payload.type==='error'||!/^(0|[1-9]\d*)$/.test(String(payload.total))||!Number.isSafeInteger(total)||total>maxVertices||Number(payload.page)!==page||!Array.isArray(payload.registros)
            ||(expected!==null&&total!==expected)||payload.registros.length!==Math.min(size,Math.max(0,total-(page-1)*size)))throw new Error('FIBERDOCS_COORDINATE_DATA_SCHEMA_OR_PAGE_INVALID');
          expected=total;
          for(const raw of payload.registros){
            if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('FIBERDOCS_COORDINATE_DATA_SCHEMA_INVALID');
            const id=/^[1-9]\d*$/.test(String(raw.id))?String(raw.id):null;
            if(!id||!batch.includes(id))throw new Error('FIBERDOCS_COORDINATE_DATA_SCOPE_INVALID');
            const point=coordinatePoint(raw);
            if(!point){coordinateDataFields=Object.keys(raw).filter(key=>/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)).sort().slice(0,40);throw new Error('FIBERDOCS_COORDINATE_DATA_ROW_SHAPE_INVALID');}
            if(result.has(id))throw new Error('FIBERDOCS_COORDINATE_DATA_DUPLICATE_ROW');
            result.set(id,point);
          }
          received+=payload.registros.length;
          if(received===total)break;
          if(page===50)throw new Error('FIBERDOCS_COORDINATE_DATA_PAGE_LIMIT');
        }
      }
      return result;
    }
    try{
      const [posts,cables]=await Promise.all([listElements('PT'),listElements('CB')]);
      const inline=new Map<string,Coordinates[]>();const unresolved=new Set<string>();
      for(const row of [...posts,...cables]){
        const points=parseCoordinates(row.coordenadas,row.tipo==='CB'?2:1);
        if(points)inline.set(String(row.id),points);else unresolved.add(String(row.id));
      }
      let coordinateReadComplete=true;let coordinateFailure:string|null=null;let coordinateRows:CoordinateRow[]=[];let coordinatePoints=new Map<string,Coordinates>();
      if(unresolved.size){
        try{
          coordinateRows=await listCoordinateRows([...unresolved]);
          const coordinateIds=[...new Set(coordinateRows.flatMap(row=>row.coordinateId?[row.coordinateId]:[]))];
          if(coordinateIds.length){
            coordinatePoints=await listCoordinatePoints(coordinateIds);
            if(coordinateIds.some(id=>!coordinatePoints.has(id))){coordinateReadComplete=false;coordinateFailure='FIBERDOCS_COORDINATE_DATA_ROWS_MISSING';}
          }
        }
        catch(error){
          coordinateReadComplete=false;
          const message=error instanceof Error?error.message:'';
          coordinateFailure=/^FIBERDOCS_COORDINATES_[A-Z0-9_]+$/.test(message)||/^FIBERDOCS_COORDINATE_DATA_[A-Z0-9_]+$/.test(message)?message:
            error instanceof Error&&error.name==='TimeoutError'?'FIBERDOCS_COORDINATES_TIMEOUT':'FIBERDOCS_COORDINATES_REQUEST_FAILED';
        }
      }
      const byElement=new Map<string,CoordinateRow[]>();
      for(const point of coordinateRows){const points=byElement.get(point.elementId)??[];points.push(point);byElement.set(point.elementId,points);}
      const pointsFor=(row:Record<string,unknown>,minimum:number):Coordinates[]|null=>{
        const direct=inline.get(String(row.id));if(direct&&direct.length>=minimum)return direct;
        const rows=byElement.get(String(row.id));
        if(!rows)return null;
        const points=rows.sort((a,b)=>a.order-b.order||Number(a.id)-Number(b.id)).map(item=>item.point??(item.coordinateId?coordinatePoints.get(item.coordinateId):undefined)).filter((item):item is Coordinates=>Boolean(item));
        return points.length>=minimum?points:null;
      };
      const poles:FiberNetwork['poles']=[];let missingPoles=0;
      for(const row of posts){
        const points=pointsFor(row,1);
        if(!points){missingPoles++;continue;}
        poles.push({id:String(row.id),name:typeof row.descricao==='string'?row.descricao.slice(0,160):'Poste '+row.id,location:points[0]!});
      }
      const networkCables:FiberNetwork['cables']=[];const missingCables:{id:string;name:string}[]=[];let missingCableGeometry=0,vertexCount=0,geometryLimit=false;
      for(const row of cables){
        const points=pointsFor(row,2);
        if(!points){missingCableGeometry++;if(missingCables.length<100)missingCables.push({id:String(row.id),name:typeof row.descricao==='string'?row.descricao.slice(0,160):'Cabo '+row.id});continue;}
        if(vertexCount+points.length>maxVertices){geometryLimit=true;break;}
        vertexCount+=points.length;
        networkCables.push({id:String(row.id),name:typeof row.descricao==='string'?row.descricao.slice(0,160):'Cabo '+row.id,points});
      }
      const issues=[
        ...(!coordinateReadComplete?['FIBERDOCS_COORDENADAS_INDISPONIVEIS']:[]),
        ...(coordinateFailure?[coordinateFailure]:[]),
        ...(missingCableGeometry?['CABO_GEOMETRIA_PENDENTE']:[]),
        ...(missingPoles?['POSTES_SEM_COORDENADA']:[]),
        ...(geometryLimit?['FIBERDOCS_GEOMETRY_LIMIT']:[])
      ];
      return {...empty,complete:issues.length===0,poles,cables:networkCables,cableCount:cables.length,issues,...(coordinateFields||coordinateDataFields||missingCables.length?{diagnostics:{...(coordinateFields?{coordinateFields}:{}),...(coordinateDataFields?{coordinateDataFields}:{}),...(missingCables.length?{missingCables}:{})}}:{})};
    }catch{return {...empty,issues:['FIBERDOCS_LEITURA_INDISPONIVEL']};}
  };
}
