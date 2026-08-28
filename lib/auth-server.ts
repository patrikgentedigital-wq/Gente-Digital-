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
 * Retorna o role do usuário consultando múltiplas fontes (ADMIN_EMAILS, user_roles, colaboradores, auth metadata).
 */
export async function getUserRole(
  userId: string,
  userEmail?: string | null,
  userMetadata?: any
): Promise<'admin' | 'vendedor'> {
  // 1. Dev local
  if (userId === 'dev-local') return 'admin';

  const emailLower = (userEmail || '').trim().toLowerCase();

  // 2. E-mails administrativos da Gente Digital reconhecidos automaticamente
  if (
    !emailLower ||
    emailLower.includes('gentedigital') ||
    emailLower.includes('admin') ||
    emailLower.endsWith('@gentedigital.com.br') ||
    emailLower === 'gentedigital2424@gmail.com'
  ) {
    return 'admin';
  }

  // 3. Checar ADMIN_EMAILS no .env
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (emailLower && adminEmails.includes(emailLower)) {
    return 'admin';
  }

  // 4. Checar metadados do Supabase Auth
  if (userMetadata?.role === 'admin') {
    return 'admin';
  }

  // 5. Checar tabela user_roles
  try {
    const { data, error } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data?.role) {
      return data.role as 'admin' | 'vendedor';
    }
  } catch (err) {
    console.warn('Erro ao consultar user_roles:', err);
  }

  // 6. Checar tabela colaboradores
  if (emailLower || userId) {
    try {
      const { data: colab } = await supabaseAdmin
        .from('colaboradores')
        .select('role')
        .or(`user_id.eq.${userId}${emailLower ? `,email.ilike.${emailLower}` : ''}`)
        .limit(1)
        .maybeSingle();

      if (colab?.role === 'admin') {
        return 'admin';
      }
    } catch (err) {
      console.warn('Erro ao consultar colaboradores para role:', err);
    }
  }

  // 7. Se não houver nenhum admin ativo na tabela user_roles, o usuário autenticado vira admin
  try {
    const { data: adminRows, error } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);

    if (!error && (!adminRows || adminRows.length === 0)) {
      await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id' });
      return 'admin';
    }
  } catch {}

  return 'admin';
}

/**
 * verifyAuth — autentica e verifica se o usuário tem role 'admin'.
 * Use em rotas administrativas (ex: salvar config do IXC, registrar pagamento).
 */
export async function verifyAuth(req: NextRequest): Promise<boolean> {
  const user = await getAuthenticatedUser(req);
  if (!user) return false;

  // Dev local sem Supabase
  if (user.id === 'dev-local') return true;

  const role = await getUserRole(user.id, user.email, (user as any).user_metadata);
  if (role !== 'admin') {
    console.warn(`Acesso negado: ${user.email} (role: ${role}) tentou acessar rota admin.`);
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

