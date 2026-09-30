import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, getUserRole } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/**
 * Localiza o colaborador vinculado ao usuário autenticado.
 * Usa duas queries separadas com eq() para evitar filtro textual composto.
 * Retorna '' se não houver colaborador vinculado.
 */
async function getColabRefsForUser(userId: string, email?: string | null): Promise<{ name: string; id: string; unavailable: boolean }> {
  const userEmail = (email || '').trim().toLowerCase();

  const { data: byUserId, error: errUserId } = await supabaseAdmin
    .from('colaboradores')
    .select('name, id')
    .eq('user_id', userId)
    .maybeSingle();

  if (errUserId) {
    console.warn('Erro ao consultar colaborador por user_id:', errUserId.message);
    return { name: '', id: '', unavailable: true };
  }

  if (byUserId) {
    return { name: byUserId.name || '', id: String(byUserId.id || ''), unavailable: false };
  }

  if (userEmail) {
    const { data: byEmail, error: errEmail } = await supabaseAdmin
      .from('colaboradores')
      .select('name, id')
      .eq('email', userEmail)
      .maybeSingle();

    if (errEmail) {
      console.warn('Erro ao consultar colaborador por email:', errEmail.message);
      return { name: '', id: '', unavailable: true };
    }

    if (byEmail) {
      return { name: byEmail.name || '', id: String(byEmail.id || ''), unavailable: false };
    }
  }

  return { name: '', id: '', unavailable: false };
}

/**
 * GET /api/leads
 * Rota resiliente para listar leads e histórico no servidor,
 * garantindo acesso aos dados para todos os usuários autenticados.
 * Não-admins (vendedores) veem leads legados pela própria ref e leads
 * vinculados às coletas que registraram.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const role = await getUserRole(user.id, user.email);
    let leadsData: any[] = [];

    if (role === 'admin') {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Erro ao buscar leads no servidor:', error.message);
        return NextResponse.json({ success: false, error: 'Não foi possível buscar leads.' }, { status: 500 });
      }
      leadsData = data || [];
    } else {
      const colabRefs = await getColabRefsForUser(user.id, user.email);
      if (colabRefs.unavailable) {
        return NextResponse.json({ success: false, error: 'Não foi possível verificar o vínculo do colaborador.' }, { status: 503 });
      }
      const refs = Array.from(new Set([colabRefs.name, colabRefs.id].filter(Boolean)));

      if (refs.length > 0) {
        const { data, error } = await supabaseAdmin
          .from('leads')
          .select('*')
          .in('ref', refs);
        if (error) {
          console.error('Erro ao buscar leads de indicação no servidor:', error.message);
          return NextResponse.json({ success: false, error: 'Não foi possível buscar leads.' }, { status: 500 });
        }
        leadsData.push(...(data || []));
      }

      if (colabRefs.id) {
        const collectionIds: string[] = [];
        const collectionPageSize = 1000;
        for (let offset = 0; ; offset += collectionPageSize) {
          const { data, error } = await supabaseAdmin
            .from('post_sale_collections')
            .select('id')
            .eq('collector_colaborador_id', colabRefs.id)
            .order('id', { ascending: true })
            .range(offset, offset + collectionPageSize - 1);
          if (error) {
            console.error('Erro ao buscar coletas do vendedor:', error.message);
            return NextResponse.json({ success: false, error: 'Não foi possível buscar leads.' }, { status: 500 });
          }
          const page = data || [];
          collectionIds.push(...page.map((row: any) => String(row.id)).filter(Boolean));
          if (page.length < collectionPageSize) break;
        }

        for (let index = 0; index < collectionIds.length; index += 250) {
          const collectionChunk = collectionIds.slice(index, index + 250);
          const { data, error } = await supabaseAdmin
            .from('leads')
            .select('*')
            .in('post_sale_collection_id', collectionChunk);
          if (error) {
            console.error('Erro ao buscar leads de pós-venda no servidor:', error.message);
            return NextResponse.json({ success: false, error: 'Não foi possível buscar leads.' }, { status: 500 });
          }
          leadsData.push(...(data || []));
        }
      }

      // Uma indicação pode aparecer nos dois escopos; preserve um único registro.
      leadsData = Array.from(new Map(leadsData.map((lead) => [String(lead.id), lead])).values());
      leadsData.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }

    if (leadsData.length === 0) {
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
