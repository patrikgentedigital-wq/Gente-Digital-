import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';

function createSupabaseServerClient(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll() {},
    },
  });
}

/**
 * Retorna o usuário autenticado via cookies de sessão do Supabase.
 * Retorna null se não autenticado ou se Supabase não estiver configurado.
 */
export async function getAuthenticatedUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ALERTA DE SEGURANÇA: NEXT_PUBLIC_SUPABASE_URL ausente em produção.');
      return null;
    }
    // Dev local sem Supabase: simula usuário admin
    return { id: 'dev-local', email: 'dev@local' };
  }

  const client = createSupabaseServerClient(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Retorna o role do usuário consultando a tabela user_roles no Supabase.
 * Retorna null se o usuário não tiver role cadastrado.
 */
export async function getUserRole(userId: string): Promise<'admin' | 'vendedor' | null> {
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data.role as 'admin' | 'vendedor';
}

/**
 * verifyAuth — autentica e verifica se o usuário tem role 'admin' no Supabase.
 * Use em rotas administrativas (ex: salvar config do IXC, registrar pagamento).
 */
export async function verifyAuth(req: NextRequest): Promise<boolean> {
  const user = await getAuthenticatedUser(req);
  if (!user) return false;

  // Dev local sem Supabase
  if (user.id === 'dev-local') return true;

  const role = await getUserRole(user.id);
  if (role !== 'admin') {
    console.warn(`Acesso negado: ${user.email} (role: ${role ?? 'sem role'}) tentou acessar rota admin.`);
    return false;
  }

  return true;
}

/**
 * verifyAuthAny — autentica qualquer usuário logado, independente do role.
 * Use em rotas que vendedores também precisam acessar (ex: sync IXC, ver comissões).
 */
export async function verifyAuthAny(req: NextRequest): Promise<boolean> {
  const user = await getAuthenticatedUser(req);
  return !!user;
}

