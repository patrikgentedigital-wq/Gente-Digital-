import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function createSupabaseServerClient(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { supabaseUrl, supabaseAnonKey, client: createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    }
  )};
}

/**
 * verifyAuth — autentica apenas emails na lista ADMIN_EMAILS.
 * Use em rotas administrativas (ex: salvar config do IXC).
 */
export async function verifyAuth(req: NextRequest): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  // Modo offline/dev local sem Supabase configurado
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ALERTA DE SEGURANÇA: NEXT_PUBLIC_SUPABASE_URL ausente em ambiente de produção.');
      return false;
    }
    return true;
  }

  const { client } = createSupabaseServerClient(req);
  const { data: { user }, error } = await client.auth.getUser();
  
  if (error || !user) return false;

  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
    : [];

  if (adminEmails.length > 0 && user.email) {
    if (!adminEmails.includes(user.email.toLowerCase())) {
      console.warn(`Acesso bloqueado: ${user.email} tentou acessar rota protegida.`);
      return false;
    }
  }

  return true;
}

/**
 * verifyAuthAny — autentica qualquer usuário logado, independente do email.
 * Use em rotas que vendedores também precisam acessar (ex: sincronização IXC).
 */
export async function verifyAuthAny(req: NextRequest): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  // Modo offline/dev local sem Supabase configurado
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ALERTA DE SEGURANÇA: NEXT_PUBLIC_SUPABASE_URL ausente em ambiente de produção.');
      return false;
    }
    return true;
  }

  const { client } = createSupabaseServerClient(req);
  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) return false;

  return true;
}
