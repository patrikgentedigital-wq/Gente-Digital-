import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads
 * Rota resiliente para listar leads e histórico no servidor,
 * garantindo acesso aos dados para todos os usuários autenticados.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { data: leadsData, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (leadsError) {
      console.error('Erro ao buscar leads no servidor:', leadsError.message);
      return NextResponse.json({ success: false, error: leadsError.message }, { status: 500 });
    }

    if (!leadsData || leadsData.length === 0) {
      return NextResponse.json({ success: true, leads: [] });
    }

    const leadIds = leadsData.map((l: any) => l.id);
    const { data: historyData } = await supabaseAdmin
      .from('lead_history')
      .select('*')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false });

    const uiLeads = leadsData.map((lead: any) => ({
      ...lead,
      history: historyData ? historyData.filter((h: any) => h.lead_id === lead.id) : []
    }));

    return NextResponse.json({ success: true, leads: uiLeads });
  } catch (err: any) {
    console.error('Erro interno em /api/leads:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
