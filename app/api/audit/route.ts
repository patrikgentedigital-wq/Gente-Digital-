import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth-server';
import { isSameOriginRequest } from '@/lib/request-security';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

const AuditEventSchema = z.object({
  action: z.string().trim().min(1).max(120),
  details: z.string().trim().max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Nao autorizado.' }, { status: 401 });
    if (!isSameOriginRequest(request)) return NextResponse.json({ success: false, error: 'Origem nao permitida.' }, { status: 403 });
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ success: false, error: 'Auditoria indisponivel.' }, { status: 503 });

    const parsed = AuditEventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Evento invalido.' }, { status: 400 });

    const { error } = await supabaseAdmin.from('audit_logs').insert({
      action: parsed.data.action,
      details: parsed.data.details,
      user_email: user.email || user.id,
    });
    if (error) throw error;

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Audit event error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Nao foi possivel registrar o evento.' }, { status: 500 });
  }
}
