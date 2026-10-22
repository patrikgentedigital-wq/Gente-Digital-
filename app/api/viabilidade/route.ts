import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAuthenticatedUser, getUserRole } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createViabilityHandler } from '@/lib/viabilidade/handler';
import { createDemoSources } from '@/lib/viabilidade/adapters/demo';
import { auditRecord, createAuditReader, createAuditWriter } from '@/lib/viabilidade/audit';
import { createPanelLiveRuntime } from '@/lib/viabilidade/runtime';
import { getIxcCredentials } from '@/lib/ixc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 40;
async function handle(request: NextRequest) {
  const localDemo=process.env.VIABILITY_DEMO_ENABLED==='true' && process.env.NODE_ENV!=='production'
    && ['localhost','127.0.0.1','[::1]'].includes(request.nextUrl.hostname);
  const live=await createPanelLiveRuntime(process.env,getIxcCredentials);
  const enabled=localDemo||live.enabled;
  const db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',{
      cookies:{getAll:()=>request.cookies.getAll(),setAll:()=>{}}
    });
  const auditDir=process.env.VIABILITY_AUDIT_DIRECTORY || '.data/viabilidade';
  const handler=createViabilityHandler({enabled,sources:localDemo?createDemoSources():live.sources,
    ...(!localDemo?{origin:live.origin,policy:live.policy,sourceStatus:live.sourceStatus,diagnostics:live.diagnostics,roadGraph:live.roadGraph,...(live.network?{network:live.network}:{})}:{}),
    authenticate:async()=>{
      const user=await getAuthenticatedUser(request);
      if (user?.id==='dev-local' && !localDemo) return null;
      if (user && user.id!=='dev-local') {
        const role=await getUserRole(user.id);
        if (role!=='admin' && role!=='vendedor') return null;
      }
      return user;
    },
    authorizeLead:async(leadId,actor)=>{
      if (actor.id==='dev-local') return localDemo && leadId<=5;
      const {data,error}=await db.from('leads').select('id').eq('id',leadId).maybeSingle();
      return !error && Boolean(data);
    },
    save:async(decision,leadId,actor)=>{
      if (actor.id==='dev-local' && localDemo) {
        await createAuditWriter(auditDir,()=>new Date(),90,leadId)(decision);return;
      }
      // Escrita exclusivamente no servidor; usuários não fabricam decisões pela Data API.
      const {error}=await supabaseAdmin.from('viability_evaluations').insert({
        decision_id:decision.id,user_id:actor.id,lead_id:leadId,result:auditRecord(decision,leadId)
      });
      if(error)throw new Error('AUDIT_PERSISTENCE_FAILED');
    },
    history:async(actor)=>{
      if(actor.id==='dev-local' && localDemo)return createAuditReader(auditDir)();
      const {data,error}=await db.from('viability_evaluations').select('result,lead_id')
        .order('created_at',{ascending:false}).limit(100);
      if(error)throw new Error('AUDIT_HISTORY_UNAVAILABLE');
      return (data??[]).map(row=>({...row.result,leadId:row.lead_id}));
    }
  });
  return handler(request);
}
export const GET=handle;
export const POST=handle;
