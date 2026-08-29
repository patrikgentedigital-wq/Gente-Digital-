import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-server';
import { getIxcCredentials, maskIxcToken } from '@/lib/ixc';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(req);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { domain, token } = await getIxcCredentials();

    return NextResponse.json({
      success: true,
      domain,
      token: maskIxcToken(token),
      hasToken: !!token,
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

    // Rejeita domínio vazio/em branco para não apagar o domínio previamente salvo
    if (domain === undefined || typeof domain !== 'string' || domain.trim() === '') {
      return NextResponse.json({ error: 'Domínio é obrigatório.' }, { status: 400 });
    }

    const trimmedDomain = domain.trim();

    const { error: err1 } = await supabase
      .from('settings')
      .upsert({ key: 'ixc_domain', value: trimmedDomain });

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
