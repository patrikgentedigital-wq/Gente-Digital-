import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/colaboradores
 * Rota resiliente para listar colaboradores no servidor,
 * garantindo acesso aos dados para todos os usuários autenticados.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('colaboradores')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar colaboradores no servidor:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, colaboradores: data || [] });
  } catch (err: any) {
    console.error('Erro interno em /api/colaboradores:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
