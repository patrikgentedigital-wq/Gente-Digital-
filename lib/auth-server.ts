import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Cache em memória de userIds já sincronizados em user_roles (TTL de 5 minutos)
// para evitar upsert redundante a cada consulta de role do mesmo usuário.
const roleSyncCache = new Map<string, number>();
const ROLE_SYNC_TTL_MS = 5 * 60 * 1000;

function shouldSyncUserRole(userId: string): boolean {
  const now = Date.now();
  const lastSync = roleSyncCache.get(userId);
  if (lastSync && now - lastSync < ROLE_SYNC_TTL_MS) {
    return false;
  }
  // Limpeza oportunista de entradas expiradas
  if (roleSyncCache.size > 100) {
    for (const [id, ts] of roleSyncCache) {
      if (now - ts >= ROLE_SYNC_TTL_MS) roleSyncCache.delete(id);
    }
  }
  return true;
}

function createSupabaseServerClient(req: NextRequest) {
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl.replace(/\/+$/, '')
    : 'https://placeholder.supabase.co';
  // Fallback para evitar crash do createServerClient com key vazia (o cliente não fará auth real)
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim() || 'placeholder_key';
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      // setAll vazio de propósito: em Route Handlers a renovação dos cookies de sessão
      // acontece no middleware (padrão recomendado pelo @supabase/ssr).
      setAll() {},
    },
  });
}

/**
 * Retorna o usuário autenticado via cookies de sessão do Supabase.
 * Retorna null se não autenticado ou se Supabase não estiver configurado.
 */
export async function getAuthenticatedUser(req: NextRequest) {
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl.replace(/\/+$/, '')
    : '';

  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    // Admin implícito em dev APENAS se não estivermos em produção e a URL do Supabase estiver ausente
    if (process.env.NODE_ENV !== 'production' && !rawUrl) {
      // Dev local sem Supabase: simula usuário admin
      return { id: 'dev-local', email: 'dev@local' };
    }
    console.error('ALERTA DE SEGURANÇA: NEXT_PUBLIC_SUPABASE_URL ausente ou placeholder.');
    return null;
  }

  const client = createSupabaseServerClient(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Retorna o role do usuário consultando múltiplas fontes (ADMIN_EMAILS, user_roles, colaboradores, auth metadata).
 * O fallback seguro é 'vendedor': nenhum usuário recebe admin implicitamente.
 */
export async function getUserRole(
  userId: string,
  userEmail?: string | null,
  userMetadata?: any
): Promise<'admin' | 'vendedor'> {
  // 1. Dev local
  if (userId === 'dev-local') return 'admin';

  const emailLower = (userEmail || '').trim().toLowerCase();

  // 2. Administradores fixos do sistema (garante que o proprietário nunca perca acesso)
  const defaultAdminEmails = [
    'patrikgentedigital@gmail.com',
    'patrick@gentedigital.com.br',
  ];

  // Checar ADMIN_EMAILS no .env (sanitizando aspas, colchetes e espaços da Vercel)
  const configuredAdminEmails = (process.env.ADMIN_EMAILS || '')
    .replace(/^[\["']|[\]"']$/g, '')
    .split(',')
    .map(e => e.trim().toLowerCase().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);

  const allAdminEmails = Array.from(new Set([...defaultAdminEmails, ...configuredAdminEmails]));

  if (emailLower && allAdminEmails.includes(emailLower)) {
    // Sincronizar na tabela user_roles e nos metadados do Supabase Auth para que as policies RLS (public.is_admin) funcionem no banco de dados
    try {
      if (userId && userId !== 'dev-local' && shouldSyncUserRole(userId)) {
        const { error: upsertError } = await supabaseAdmin
          .from('user_roles')
          .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id' });
        if (upsertError) {
          console.warn('Falha ao sincronizar user_roles para admin:', upsertError.message || upsertError);
        } else {
          roleSyncCache.set(userId, Date.now());
        }
      }
    } catch (err) {
      console.warn('Erro ao sincronizar user_roles para admin:', err);
    }
    return 'admin';
  }

  // 3. Checar metadados do Supabase Auth
  if (userMetadata?.role === 'admin') {
    return 'admin';
  }

  // 4. Checar tabela user_roles
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

  // 5. Checar tabela colaboradores (valores entre aspas para não quebrar a sintaxe do or())
  if (userId || emailLower) {
    try {
      const orParts: string[] = [];
      if (userId) orParts.push(`user_id.eq.${userId}`);
      // eq em vez de ilike: o ilike trataria '_' como curinga (falso positivo em e-mails)
      if (emailLower) orParts.push(`email.eq."${emailLower.replace(/"/g, '""')}"`);

      const { data: colab } = await supabaseAdmin
        .from('colaboradores')
        .select('role')
        .or(orParts.join(','))
        .limit(1)
        .maybeSingle();

      if (colab?.role === 'admin') {
        return 'admin';
      }
    } catch (err) {
      console.warn('Erro ao consultar colaboradores para role:', err);
    }
  }

  return 'vendedor';
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

