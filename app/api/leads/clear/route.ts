import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAdmin } from '@/lib/auth-server';
import { isSameOriginRequest } from '@/lib/request-security';

const ClearLeadsSchema = z.object({ confirm: z.literal(true) });

export async function POST(request: NextRequest) {
  try {
    if (!await verifyAdmin(request)) return NextResponse.json({ success: false, error: 'Nao autorizado.' }, { status: 401 });
    if (!isSameOriginRequest(request)) return NextResponse.json({ success: false, error: 'Origem nao permitida.' }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!ClearLeadsSchema.safeParse(body).success) {
      return NextResponse.json({ success: false, error: 'A confirmacao e obrigatoria.' }, { status: 400 });
    }

    const { error: historyError } = await supabaseAdmin.from('lead_history').delete().neq('id', 0);
    if (historyError) throw historyError;
    const { error: leadsError } = await supabaseAdmin.from('leads').delete().neq('id', 0);
    if (leadsError) throw leadsError;

    return NextResponse.json({ success: true, message: 'Leads e historicos excluidos.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Clear leads error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Falha ao apagar os leads.' }, { status: 500 });
  }
}
