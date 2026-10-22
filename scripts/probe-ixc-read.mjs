import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
loadEnvConfig(process.cwd(),true,{info(){},error(){}});

const token=process.env.IXC_TOKEN;
if(!token || !/^[1-9]\d*:[^\s:]+$/.test(token)) {
  console.log(JSON.stringify({configured:false,code:'IXC_ENV_CREDENTIAL_UNAVAILABLE'}));process.exit(0);
}

const endpoint='https://ixc.gentedigital.com.br/webservice/v1/rad_caixa_ftth';
const pageSize=400;
const selectors=['id_projeto','id_cidade','id_transmissor'];
const groups=Object.fromEntries(selectors.map(field=>[field,new Map()]));
const seenIds=new Set();
const statusCounts={A:0,I:0,other:0};
let total=null;let complete=true;let firstRecord=null;let count=0;let missingCoordinates=0;
let invalidCoordinates=0;

function regionMarker(name) {
  if(typeof name!=='string')return 'none';
  const found=new Set([...name.matchAll(/(?:^|[^A-Z])(AC|CP)(?=$|[^A-Z])/gi)].map(match=>match[1].toUpperCase()));
  return found.size===1?[...found][0]:found.size>1?'both':'none';
}

function validCoordinate(value,limit) {
  if(typeof value==='string'&&!/^-?\d+(?:\.\d+)?$/.test(value.trim()))return false;
  if(typeof value!=='number'&&typeof value!=='string')return false;
  const parsed=Number(value);
  return Number.isFinite(parsed)&&Math.abs(parsed)<=limit;
}

for(let page=1;page<=100;page++) {
  let response;
  try {
    response=await fetch(endpoint,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{authorization:'Basic '+Buffer.from(token).toString('base64'),ixcsoft:'listar','content-type':'application/json'},
      body:JSON.stringify({qtype:'rad_caixa_ftth.id',query:'0',oper:'>',page:String(page),rp:String(pageSize),sortname:'rad_caixa_ftth.id',sortorder:'asc'})
    });
  } catch {console.log(JSON.stringify({configured:true,success:false,code:'IXC_READ_UNAVAILABLE',page}));process.exit(0)}
  if(!response.ok){console.log(JSON.stringify({configured:true,success:false,code:'IXC_HTTP_REFUSED',httpStatus:response.status,page}));process.exit(0)}

  let payload;
  try {payload=await response.json()} catch {console.log(JSON.stringify({configured:true,success:false,code:'IXC_RESPONSE_INVALID',page}));process.exit(0)}
  const expectedTotal=Number(payload?.total);
  if(payload?.type==='error'||!Number.isSafeInteger(expectedTotal)||expectedTotal<0||Number(payload.page)!==page||!Array.isArray(payload.registros)) {
    console.log(JSON.stringify({configured:true,success:false,code:'IXC_RESPONSE_INVALID',page}));process.exit(0);
  }
  if(total===null)total=expectedTotal;
  else if(total!==expectedTotal){complete=false;break}
  const expectedRows=Math.min(pageSize,Math.max(0,total-(page-1)*pageSize));
  if(payload.registros.length!==expectedRows){complete=false;break}

  for(const row of payload.registros) {
    if(!row||typeof row!=='object'||Array.isArray(row)){complete=false;break}
    if(!firstRecord)firstRecord=row;
    const id=String(row.id??'');
    if(!/^\d+$/.test(id)||seenIds.has(id)){complete=false;break}
    seenIds.add(id);count++;
    if(row.status==='A')statusCounts.A++;else if(row.status==='I')statusCounts.I++;else statusCounts.other++;
    if(row.latitude===null||row.latitude===undefined||row.latitude===''||row.longitude===null||row.longitude===undefined||row.longitude==='')missingCoordinates++;
    else if(!validCoordinate(row.latitude,90)||!validCoordinate(row.longitude,180))invalidCoordinates++;
    const marker=regionMarker(row.descricao);
    for(const field of selectors) {
      const value=String(row[field]??'').trim();
      if(!value)continue;
      const group=groups[field].get(value)??{rows:0,AC:0,CP:0,both:0,none:0};
      group.rows++;group[marker]++;groups[field].set(value,group);
    }
  }
  if(!complete)break;
  if(count>=total)break;
}

complete=complete&&total!==null&&count===total;
const associationSummary=Object.fromEntries(selectors.map(field=>[field,{
  distinctValues:groups[field].size,
  values:[...groups[field].entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([value,counts])=>({value,...counts}))
}]));
console.log(JSON.stringify({configured:true,success:complete,resource:'rad_caixa_ftth',pages:Math.ceil(count/pageSize),total:complete?total:null,recordsRead:count,
  statusCounts,missingCoordinates,invalidCoordinates,recordFields:firstRecord?Object.fromEntries(['id','descricao','status','capacidade','latitude','longitude',...selectors].map(key=>[key,typeof firstRecord[key]])):null,
  associationSummary}));
