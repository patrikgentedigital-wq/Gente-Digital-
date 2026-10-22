import type { DataSources } from './adapters/ports';
import type { Decision, Policy, RouteEvidence } from './domain/types';
import { evaluate, parseRequestBody } from './service';
import type { FiberNetwork } from './domain/network-path';
import type { RoadGraph } from './domain/road-route';

export type Actor = { id: string };
export type ViabilityDependencies = {
  enabled: boolean;
  origin?: 'DEMO' | 'LIVE';
  policy?: Policy;
  routes?: (request: import('./domain/types').Request) => Promise<RouteEvidence[]>;
  network?: (region: import('./domain/types').Region) => Promise<FiberNetwork>;
  roadGraph?: (region: import('./domain/types').Region) => Promise<RoadGraph | null>;
  sourceStatus?: {sources:{name:string;state:string}[];blockers:string[]};
  diagnostics?: () => Promise<unknown>;
  authenticate(request: Request): Promise<Actor | null>;
  authorizeLead(leadId: number, actor: Actor): Promise<boolean>;
  sources: DataSources;
  save(decision: Decision, leadId: number | null, actor: Actor): Promise<void>;
  history(actor: Actor): Promise<unknown[]>;
};
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const MAX_BODY_BYTES = 16 * 1024;

export async function readBoundedBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<{ text: string | null; tooLarge: boolean }> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    return { text: null, tooLarge: true };
  }
  if (!request.body) return { text: '', tooLarge: false };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        try { await reader.cancel(); } catch { /* A failed body stream is already closed. */ }
        return { text: null, tooLarge: true };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { text, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

export function createViabilityHandler(deps: ViabilityDependencies) {
  const origin=deps.origin??'DEMO';
  const policy=deps.policy??(origin==='DEMO'
    ? {maxDistanceMeters:500 as const,maxUpdateAgeDays:30,version:'demo-v1',regionalCoverageConfirmed:true}
    : {maxDistanceMeters:500 as const,maxUpdateAgeDays:null,version:'live-v1',regionalCoverageConfirmed:false});
  return async (request: Request): Promise<Response> => {
    try {
      const actor = await deps.authenticate(request);
      if (!actor) return json({ error: 'UNAUTHORIZED' }, 401);
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const view = url.searchParams.get('view') ?? 'status';
        if (view === 'status') return json({mode: deps.enabled ? origin : 'PENDENTE',productionReady:false,
          enabled:deps.enabled,sources:deps.sourceStatus?.sources??[],blockers:deps.sourceStatus?.blockers??[]});
        if (view === 'history') return json({rows:await deps.history(actor)});
        if(view==='diagnostics'){
          if(!deps.enabled||origin!=='LIVE'||!deps.diagnostics)return json({error:'LIVE_DIAGNOSTICS_UNAVAILABLE'},503);
          return json(await deps.diagnostics());
        }
        if(view==='network'){
          const region=url.searchParams.get('region');
          if(region!=='AC'&&region!=='CP')return json({error:'REGION_REQUIRED'},400);
          if(!deps.enabled||!deps.network)return json({error:'FIBERDOCS_NOT_CONFIGURED'},503);
          return json(await deps.network(region));
        }
        if (view === 'ctos') {
          const region=url.searchParams.get('region');
          if (region !== 'AC' && region !== 'CP') return json({error:'REGION_REQUIRED'},400);
          if (!deps.enabled) return json({error:'VIABILITY_NOT_CONFIGURED'},503);
          const snapshot=await deps.sources.loadIxc(region);
          return json({origin:snapshot.origin,complete:snapshot.complete,rows:snapshot.rows.map(r=>({
            id:r.id,name:r.originalName,region:r.region,active:r.active,location:r.location
          }))});
        }
        return json({error:'UNKNOWN_VIEW'},400);
      }
      if (request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
      const protocol=request.headers.get('x-forwarded-proto');
      const publicOrigin=(protocol==='https'||protocol==='http'?protocol+':':url.protocol)+'//'+(request.headers.get('host')??url.host);
      if (request.headers.get('origin') !== publicOrigin) return json({error:'ORIGIN_REFUSED'},403);
      if (!deps.enabled) return json({error:'VIABILITY_NOT_CONFIGURED'},503);
      if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return json({error:'APPLICATION_JSON_REQUIRED'},415);
      const bounded=await readBoundedBody(request);
      if (bounded.tooLarge) return json({error:'BODY_TOO_LARGE'},413);
      let body: Record<string,unknown>;
      try {body=JSON.parse(bounded.text??'')} catch {return json({error:'INVALID_JSON'},400)}
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error:'JSON_OBJECT_REQUIRED'},400);
      const {leadId,...input}=body;
      const parsed=parseRequestBody(input);
      if (!parsed.request) return json({error:parsed.error},400);
      if (leadId !== undefined && (typeof leadId !== 'number' || !Number.isSafeInteger(leadId) || leadId < 1)) return json({error:'LEAD_ID_INVALID'},400);
      const linkedLead=typeof leadId==='number'?leadId:null;
      if (linkedLead!==null && !(await deps.authorizeLead(linkedLead,actor))) return json({error:'LEAD_ACCESS_REFUSED'},403);
      const now=new Date();
      const routes=deps.routes?await deps.routes(parsed.request):origin==='DEMO'
        ? [{ctoId:'DEMO-AC-01',location:{latitude:12.345,longitude:45.678},meters:320,confirmedAt:now.toISOString(),reference:'DEMO-ROUTE-01'}]:[];
      const evaluation=await evaluate(parsed.request,deps.sources,policy,routes,now,origin,deps.network,deps.roadGraph);
      const decision=evaluation.decision;
      // Uma fonte demonstrativa nunca pode escapar pelo caminho de produção.
      if(origin==='LIVE'&&decision.origin!=='LIVE')return json({error:'LIVE_SOURCE_ORIGIN_REFUSED'},503);
      try {await deps.save(decision,linkedLead,actor)} catch {return json({error:'EVALUATION_AUDIT_UNAVAILABLE'},503)}
      return json({...decision,leadId:linkedLead,routeGeometries:evaluation.routeGeometries,...(deps.network?{network:evaluation.network}:{})});
    } catch {return json({error:'VIABILITY_UNAVAILABLE'},503)}
  };
}
