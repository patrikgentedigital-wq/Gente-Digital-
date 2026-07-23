import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-server';

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 6) return '****';
  return '*'.repeat(token.length - 4) + token.slice(-4);
}

export async function GET(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(req);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const envDomain = process.env.IXC_DOMAIN || '';
    const envToken = process.env.IXC_TOKEN || '';

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['ixc_domain', 'ixc_token']);

    if (error) {
      console.warn("Error reading settings table:", error.message);
      return NextResponse.json({ 
        success: true, 
        domain: envDomain, 
        token: maskToken(envToken),
        hasToken: !!envToken,
        tableMissing: true 
      });
    }

    const config: Record<string, string> = {};
    data?.forEach((row: any) => {
      config[row.key] = row.value;
    });

    const activeDomain = config['ixc_domain'] || envDomain;
    const activeToken = config['ixc_token'] || envToken;

    return NextResponse.json({
      success: true,
      domain: activeDomain,
      token: maskToken(activeToken),
      hasToken: !!activeToken,
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

    if (domain === undefined) {
      return NextResponse.json({ error: 'Domínio é obrigatório.' }, { status: 400 });
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

    // Se o token fornecido não for mascarado (não começa com '*'), atualiza no banco
    if (token && !token.startsWith('*')) {
      const { error: err2 } = await supabase
        .from('settings')
        .upsert({ key: 'ixc_token', value: token });

      if (err2) throw err2;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
