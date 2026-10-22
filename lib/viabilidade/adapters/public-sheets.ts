import type { Region, SheetCto, Snapshot } from '../domain/types';
import {parseSheetRows,validateSheetHeaders} from '../domain/normalize';
import type {FetchLike} from './ports';

const MAX_BYTES=2*1024*1024;
const MAX_ROWS=10000;
const TABS={CP:{gid:'670146227'},AC:{gid:'0'}} as const;

export function parseCsv(text:string):string[][] {
  const rows:string[][]=[];let row:string[]=[];let value='';let quoted=false;let closed=false;
  text=text.replace(/^\uFEFF/,'');
  const addRow=()=>{row.push(value);rows.push(row);row=[];value='';closed=false;if(rows.length>MAX_ROWS)throw Error('CSV_ROW_LIMIT')};
  for(let i=0;i<text.length;i++) {
    const c=text[i]!;
    if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++}else{quoted=false;closed=true}}else value+=c;continue}
    if(c==='"'){if(value||closed)throw Error('CSV_INVALID');quoted=true;continue}
    if(c===','){row.push(value);value='';closed=false;continue}
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;addRow();continue}
    if(closed)throw Error('CSV_INVALID');value+=c;
  }
  if(quoted)throw Error('CSV_INVALID');if(value||row.length||closed)addRow();
  return rows;
}

async function csvText(response:Response):Promise<string> {
  if(Number(response.headers.get('content-length')??0)>MAX_BYTES)throw Error('CSV_SIZE_LIMIT');
  if(!response.body)throw Error('CSV_EMPTY');
  const reader=response.body.getReader();const decoder=new TextDecoder();let bytes=0;let text='';
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Error('CSV_SIZE_LIMIT')}text+=decoder.decode(chunk.value,{stream:true})}return text+decoder.decode()}
  finally{reader.releaseLock()}
}

export function createPublicSheetsAdapter(spreadsheetId:string,fetcher:FetchLike=fetch,now:()=>Date=()=>new Date()) {
  if(!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId))throw Error('ID da planilha inválido.');
  return {async loadSheets(region:Region):Promise<Snapshot<SheetCto>> {
    const fetchedAt=now().toISOString();
    try {
      let url=new URL('https://docs.google.com/spreadsheets/d/'+spreadsheetId+'/export');
      // Somente colunas operacionais A:O. P:R e códigos auxiliares ficam fora da leitura.
      url.search=new URLSearchParams({format:'csv',gid:TABS[region].gid,range:'A:O'}).toString();
      const signal=AbortSignal.timeout(15000);
      for(let hop=0;hop<4;hop++) {
        const response=await fetcher(url,{method:'GET',redirect:'manual',signal,cache:'no-store'});
        if([301,302,303,307,308].includes(response.status)) {
          const location=response.headers.get('location');if(!location)throw Error('CSV_REDIRECT_INVALID');
          const next=new URL(location,url);
          if(next.protocol!=='https:'||next.username||next.password
            ||!(next.hostname==='docs.google.com'||/^doc-[a-z0-9-]+-sheets\.googleusercontent\.com$/.test(next.hostname)))throw Error('CSV_REDIRECT_REFUSED');
          url=next;continue;
        }
        if(!response.ok||!/^text\/csv(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('CSV_ACCESS_UNAVAILABLE');
        const matrix=parseCsv(await csvText(response));
        if(matrix.some(row=>row.length>15))throw Error('CSV_COLUMN_SCOPE_INVALID');
        const issues=validateSheetHeaders(region,matrix);
        if(issues.length)return {rows:[],fetchedAt,complete:false,origin:'LIVE',issues};
        return {rows:parseSheetRows(region,matrix),fetchedAt,complete:true,origin:'LIVE',issues:[]};
      }
      throw Error('CSV_REDIRECT_LIMIT');
    }catch{return {rows:[],fetchedAt,complete:false,origin:'LIVE',issues:['PLANILHA_READ_FAILED']}}
  }};
}
