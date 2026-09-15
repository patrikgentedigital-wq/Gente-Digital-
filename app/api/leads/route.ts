import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, getUserRole } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/**
 * Localiza o colaborador vinculado ao usuário autenticado.
 * Usa duas queries separadas com eq() (sem .or()) para evitar injeção de filtro.
 * Retorna '' se não houver colaborador vinculado.
 */
async function getColabRefsForUser(userId: string, email?: string | null): Promise<{ name: string; id: string }> {
  const userEmail = (email || '').trim().toLowerCase();

  const { data: byUserId, error: errUserId } = await supabaseAdmin
    .from('colaboradores')
    .select('name, id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (errUserId) {
    console.warn('Erro ao consultar colaborador por user_id:', errUserId.message);
    return { name: '', id: '' };
  }

  if (byUserId) {
    return { name: byUserId.name || '', id: String(byUserId.id || '') };
  }

  if (userEmail) {
    const { data: byEmail, error: errEmail } = await supabaseAdmin
      .from('colaboradores')
      .select('name, id')
      .eq('email', userEmail)
      .limit(1)
      .maybeSingle();

    if (errEmail) {
      console.warn('Erro ao consultar colaborador por email:', errEmail.message);
      return { name: '', id: '' };
    }

    if (byEmail) {
      return { name: byEmail.name || '', id: String(byEmail.id || '') };
    }
  }

  return { name: '', id: '' };
}

/**
 * GET /api/leads
 * Rota resiliente para listar leads e histórico no servidor,
 * garantindo acesso aos dados para todos os usuários autenticados.
 * Não-admins (vendedores) veem apenas os leads vinculados à sua ref.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const role = await getUserRole(user.id, user.email, (user as any).user_metadata);

    let leadsQuery = supabaseAdmin
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    // Vendedor só visualiza os leads atribuídos à própria indicação
    if (role !== 'admin') {
      const colabRefs = await getColabRefsForUser(user.id, user.email);
      const refs = Array.from(new Set([colabRefs.name, colabRefs.id].filter(Boolean)));
      if (refs.length === 0) {
        // Sem colaborador vinculado: nenhum lead é retornado (nunca todos)
        return NextResponse.json({ success: true, leads: [] });
      }
      leadsQuery = leadsQuery.in('ref', refs);
    }

    const { data: leadsData, error: leadsError } = await leadsQuery;

    if (leadsError) {
      console.error('Erro ao buscar leads no servidor:', leadsError.message);
      return NextResponse.json({ success: false, error: leadsError.message }, { status: 500 });
    }

    if (!leadsData || leadsData.length === 0) {
      return NextResponse.json({ success: true, leads: [] });
    }

    const leadIds = leadsData.map((l: any) => l.id);
    const { data: historyData, error: historyError } = await supabaseAdmin
      .from('lead_history')
      .select('*')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false });

    if (historyError) {
      console.warn('Aviso ao buscar histórico de leads (continuando sem histórico):', historyError.message);
    }

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
