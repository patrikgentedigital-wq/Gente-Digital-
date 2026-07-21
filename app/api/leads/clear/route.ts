import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createServerClient } from '@supabase/ssr';

async function verifyAuth(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    // Modo offline/dev local sem Supabase configurado
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

  const { data: { user } } = await client.auth.getUser();
  
  if (!user) return false;

  const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [];
  if (adminEmails.length > 0 && user.email) {
    if (!adminEmails.includes(user.email.toLowerCase())) {
      console.warn(`Acesso bloqueado: ${user.email} tentou limpar leads.`);
      return false; // Usuário autenticado, mas não é admin
    }
  }

  return true;
}

export async function POST(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(req);
    if (!isAuthenticated) {
      return NextResponse.json({ success: false, error: 'Não autorizado. Faça login para continuar.' }, { status: 401 });
    }

    // Deleta os históricos de leads primeiro (para evitar erros de FK se não houver CASCADE)
    const { error: historyError } = await supabase.from('lead_history').delete().neq('id', 0);
    if (historyError) {
      console.warn('Erro ao limpar histórico de leads:', historyError.message);
    }

    // Deleta todos os leads
    const { error: leadsError } = await supabase.from('leads').delete().neq('id', 0);
    if (leadsError) {
      throw leadsError;
    }

    return NextResponse.json({ success: true, message: 'Todos os leads e históricos foram excluídos com sucesso.' });

  } catch (err: any) {
    console.error('Error in clear leads endpoint:', err);
    return NextResponse.json({ success: false, error: err.message || 'Falha ao apagar os leads.' }, { status: 500 });
  }
}
