import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-server';
import { getIxcCredentials, maskIxcToken, cleanIxcDomain } from '@/lib/ixc';

export const dynamic = 'force-dynamic';

// Formato mínimo de domínio: labels alfanuméricos com TLD de pelo menos 2 letras
const DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

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

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ success: false, error: 'Payload inválido: corpo da requisição não é um JSON válido.' }, { status: 400 });
    }

    const { domain, token } = rawBody as { domain?: unknown; token?: unknown };

    // Tipos obrigatoriamente string para evitar payload malformado
    if (typeof token !== 'string' || typeof domain !== 'string') {
      return NextResponse.json({ success: false, error: 'Domínio e token devem ser textos.' }, { status: 400 });
    }

    // Rejeita domínio vazio/em branco para não apagar o domínio previamente salvo
    if (domain.trim() === '') {
      return NextResponse.json({ error: 'Domínio é obrigatório.' }, { status: 400 });
    }

    // Rejeita token vazio explicitamente em vez de apenas ignorar o token
    if (token.trim() === '') {
      return NextResponse.json({ success: false, error: 'Token é obrigatório' }, { status: 400 });
    }

    const trimmedDomain = domain.trim();

    // Valida o formato do domínio após a limpeza (protocolo/www/barra final)
    const cleanedDomain = cleanIxcDomain(trimmedDomain);
    if (!DOMAIN_PATTERN.test(cleanedDomain)) {
      return NextResponse.json({ success: false, error: 'Domínio inválido. Use o formato: seudominio.com.br' }, { status: 400 });
    }

    const { error: err1 } = await supabase
      .from('settings')
      .upsert({ key: 'ixc_domain', value: cleanedDomain });

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
