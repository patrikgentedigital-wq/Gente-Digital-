import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth-server';
import { isSameOriginRequest } from '@/lib/request-security';
import { fetchIxc, normalizeIxcHost, getIxcConfig } from '@/lib/ixc';
import { checkPublicRateLimit } from '@/lib/rate-limit';

const TestSchema = z.object({
  domain: z.string().trim().min(1).max(253),
  token: z.string().trim().max(300).optional().default(''),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem nao permitida.' }, { status: 403 });

    const rateLimit = await checkPublicRateLimit('ixc-test', request, `user:${admin.id}`);
    if (rateLimit.unavailable) return NextResponse.json({ error: 'Rate limit indisponivel.' }, { status: 503 });
    if (!rateLimit.success) return NextResponse.json({ error: 'Muitos testes de conexao.' }, { status: 429 });

    const body = await request.json().catch(() => null);
    const parsed = TestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dominio invalido.' }, { status: 400 });

    const host = normalizeIxcHost(parsed.data.domain);
    if (!host) return NextResponse.json({ error: 'Dominio IXC nao permitido.' }, { status: 400 });

    let token = parsed.data.token;
    if (!token || token.startsWith('*')) token = (await getIxcConfig())?.token || '';
    if (!token) return NextResponse.json({ error: 'Token do IXC nao encontrado.' }, { status: 400 });

    const response = await fetchIxc(`${host}/webservice/v1/cliente`, token, {
      qtype: 'cliente.id',
      query: '0',
      oper: '>',
      page: '1',
      rp: '1',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({ success: false, error: 'Credenciais invalidas no IXC.' });
      }
      return NextResponse.json({ success: false, error: `Servidor IXC respondeu com codigo ${response.status}.` });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, message: 'Conexao validada.', totalClientes: Number(data.total) || 0 });
  } catch (error) {
    console.error('IXC test error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Nao foi possivel conectar ao IXC.' }, { status: 500 });
  }
}
