import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth-server';
import { isSameOriginRequest } from '@/lib/request-security';
import { normalizeIxcHost } from '@/lib/ixc';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

const IxcConfigSchema = z.object({
  domain: z.string().trim().min(1).max(253),
  token: z.string().trim().max(300).optional().default(''),
});

function maskToken(token: string) {
  if (!token) return '';
  if (token.length <= 6) return '****';
  return '*'.repeat(token.length - 4) + token.slice(-4);
}

export async function GET(request: NextRequest) {
  try {
    if (!await getAdminUser(request)) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ success: false, error: 'Integracao indisponivel.' }, { status: 503 });

    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['ixc_domain', 'ixc_token']);
    if (error) throw error;

    const config = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
    const domain = normalizeIxcHost(config.ixc_domain || process.env.IXC_DOMAIN || '') || '';
    const token = config.ixc_token || process.env.IXC_TOKEN || '';

    return NextResponse.json({ success: true, domain, token: maskToken(token), hasToken: Boolean(token) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('IXC config read error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Nao foi possivel carregar a configuracao.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await getAdminUser(request)) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem nao permitida.' }, { status: 403 });
    if (!isSupabaseAdminConfigured()) return NextResponse.json({ success: false, error: 'Integracao indisponivel.' }, { status: 503 });

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 8 * 1024) return NextResponse.json({ error: 'Payload excede o limite permitido.' }, { status: 413 });
    const body = await request.json().catch(() => null);
    const parsed = IxcConfigSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dominio ou token invalidos.' }, { status: 400 });

    const domain = normalizeIxcHost(parsed.data.domain);
    if (!domain) return NextResponse.json({ error: 'Dominio IXC nao permitido. Configure IXC_ALLOWED_HOSTS.' }, { status: 400 });

    const { error: domainError } = await supabaseAdmin
      .from('settings')
      .upsert({ key: 'ixc_domain', value: domain });
    if (domainError) throw domainError;

    if (parsed.data.token && !parsed.data.token.startsWith('*')) {
      const { error: tokenError } = await supabaseAdmin
        .from('settings')
        .upsert({ key: 'ixc_token', value: parsed.data.token });
      if (tokenError) throw tokenError;
    }

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('IXC config write error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Nao foi possivel salvar a configuracao.' }, { status: 500 });
  }
}
