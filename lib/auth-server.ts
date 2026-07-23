import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function verifyAuth(req: NextRequest): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Modo offline/dev local sem Supabase configurado
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ALERTA DE SEGURANÇA: NEXT_PUBLIC_SUPABASE_URL ausente em ambiente de produção.');
      return false;
    }
    return true;
  }

  const client = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

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
