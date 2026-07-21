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
      console.warn(`Acesso bloqueado: ${user.email} tentou acessar rota protegida.`);
      return false; // Usuário autenticado, mas não é admin
    }
  }

  return true;
}

export async function GET(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(req);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const envDomain = process.env.IXC_DOMAIN || '';
    const envToken = process.env.IXC_TOKEN || '';

    // If the database configurations are loaded, fetch settings
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['ixc_domain', 'ixc_token']);

    if (error) {
      console.warn("Error reading settings table:", error.message);
      return NextResponse.json({ 
        success: true, 
        domain: envDomain, 
        token: envToken, 
        tableMissing: true 
      });
    }

    const config: Record<string, string> = {};
    data?.forEach((row: any) => {
      config[row.key] = row.value;
    });

    return NextResponse.json({
      success: true,
      domain: config['ixc_domain'] || envDomain,
      token: config['ixc_token'] || envToken,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(req);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { domain, token } = await req.json();

    if (domain === undefined || token === undefined) {
      return NextResponse.json({ error: 'Domínio e token são obrigatórios.' }, { status: 400 });
    }

    const { error: err1 } = await supabase
      .from('settings')
      .upsert({ key: 'ixc_domain', value: domain });

    if (err1) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tabela settings não encontrada. Certifique-se de executar o comando SQL no Supabase.' 
      }, { status: 400 });
    }

    const { error: err2 } = await supabase
      .from('settings')
      .upsert({ key: 'ixc_token', value: token });

    if (err2) throw err2;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
