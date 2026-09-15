import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/ratelimit';

/**
 * Endpoint server-side para gravação de logs de auditoria.
 * Existe para que lib/audit.ts (usado em componentes cliente) nunca importe
 * supabase-admin no bundle do browser: o insert acontece aqui, no servidor.
 * Sem auth obrigatória (o cliente não possui credenciais), mas com rate limit simples.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    try {
      const rateLimit = await checkRateLimit(`audit_${ip}`, 30, 60);
      if (!rateLimit.success) {
        return NextResponse.json({ success: false, error: 'Muitas requisições.' }, { status: 429 });
      }
    } catch (e) {
      // Rate limit é best-effort: não bloquear auditoria por falha dele
      console.warn('Falha ao aplicar rate limit em /api/audit:', e);
    }

    const body = await req.json().catch(() => null);
    const action = typeof body?.action === 'string' ? body.action.slice(0, 200) : '';
    const details = typeof body?.details === 'string' ? body.details.slice(0, 5000) : '';
    const user_email = typeof body?.user_email === 'string' ? body.user_email.slice(0, 320) : 'Admin';

    if (!action || !details) {
      return NextResponse.json({ success: false, error: 'Campos obrigatórios ausentes (action, details).' }, { status: 400 });
    }

    if (!isSupabaseAdminConfigured) {
      // Não quebrar o fluxo do usuário: auditoria é best-effort
      console.warn('[AUDIT] Supabase Admin não configurado — log de auditoria descartado.');
      return new NextResponse(null, { status: 204 });
    }

    try {
      const { error } = await supabaseAdmin.from('audit_logs').insert([{
        action,
        details,
        user_email,
        created_at: new Date().toISOString(),
      }]);
      if (error) {
        console.warn('[AUDIT] Erro ao inserir audit_logs:', error.message);
      }
    } catch (err) {
      console.warn('[AUDIT] Exceção ao inserir audit_logs:', err);
    }

    // Resposta vazia: o cliente não precisa do corpo
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.warn('[AUDIT] Falha inesperada ao processar log de auditoria:', err);
    return new NextResponse(null, { status: 204 });
  }
}
