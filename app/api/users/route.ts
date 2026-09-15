import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-server';

// GET /api/users — lista todos os usuários com seus roles (somente admin)
export async function GET(req: NextRequest) {
  try {
    const isAdmin = await verifyAuth(req);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    // Busca todos os usuários do Auth
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) {
      return NextResponse.json({ success: false, error: usersError.message }, { status: 500 });
    }

    // Busca todos os roles
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role');

    if (rolesError) {
      return NextResponse.json({ success: false, error: rolesError.message }, { status: 500 });
    }

    const rolesMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));

    const result = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: rolesMap.get(u.id) ?? 'vendedor',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));

    return NextResponse.json({ success: true, users: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/users — altera o role de um usuário (somente admin)
export async function PATCH(req: NextRequest) {
  try {
    const isAdmin = await verifyAuth(req);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Payload inválido: corpo da requisição não é um JSON válido.' },
        { status: 400 }
      );
    }

    const { userId, role } = body;

    if (!userId || !['admin', 'vendedor'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'userId e role (admin|vendedor) são obrigatórios.' },
        { status: 400 }
      );
    }

    // Impede remover o último administrador do sistema
    if (role === 'vendedor') {
      const { data: currentRole } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (currentRole?.role === 'admin') {
        // Mitigação de race do último admin: reconta os admins buscando a lista completa
        // imediatamente antes do upsert. Sem uma transação/RPC no banco, não há garantia
        // total de atomicidade — esta checagem apenas reduz a janela de corrida.
        const { data: adminList, error: adminListError } = await supabaseAdmin
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (adminListError) {
          return NextResponse.json({ success: false, error: adminListError.message }, { status: 500 });
        }

        const adminIds = (adminList || []).map((r: any) => r.user_id);

        if (adminIds.length <= 1 || !adminIds.includes(userId)) {
          return NextResponse.json(
            { success: false, error: 'Não é possível rebaixar o último administrador do sistema.' },
            { status: 400 }
          );
        }
      }
    }

    const { error } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role }, { onConflict: 'user_id' });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Role atualizado para ${role}.` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
