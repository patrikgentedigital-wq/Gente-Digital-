import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth-server';
import { isSameOriginRequest } from '@/lib/request-security';
import { fetchIxc, formatIxcDate, getIxcConfig } from '@/lib/ixc';
import { checkPublicRateLimit } from '@/lib/rate-limit';

const ProspectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30),
  ref: z.string().trim().max(50).optional().default(''),
});

const NAME_PATTERN = /^[\p{L}\p{M} .'-]+$/u;

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem nao permitida.' }, { status: 403 });

    const rateLimit = await checkPublicRateLimit('ixc-prospect', request, `user:${admin.id}`);
    if (rateLimit.unavailable) return NextResponse.json({ error: 'Rate limit indisponivel.' }, { status: 503 });
    if (!rateLimit.success) return NextResponse.json({ error: 'Muitos prospects em pouco tempo.' }, { status: 429 });

    const parsed = ProspectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Nome e telefone invalidos.' }, { status: 400 });

    const name = parsed.data.name.normalize('NFC').replace(/\s+/g, ' ');
    const phone = parsed.data.phone.replace(/\D/g, '').slice(0, 13);
    if (!NAME_PATTERN.test(name) || phone.length < 10) {
      return NextResponse.json({ success: false, error: 'Nome e telefone invalidos.' }, { status: 400 });
    }

    const config = await getIxcConfig();
    if (!config) return NextResponse.json({ success: false, error: 'IXC nao configurado.' }, { status: 503 });

    const response = await fetchIxc(`${config.host}/webservice/v1/contato`, config.token, {
      nome: name,
      razao: name,
      fone_celular: phone,
      id_filial: '1',
      data_cadastro: formatIxcDate(),
      lead: 'S',
      tipo_pessoa: 'F',
      origem: 'outros',
      obs: `Indicado via Gente Digital por: ${parsed.data.ref || 'Desconhecido'}`,
    }, 'insert');

    const data = await response.json().catch(() => ({}));
    const id = data.id ? String(data.id).trim().slice(0, 100) : '';
    if (!response.ok || data.type === 'error' || !id) {
      return NextResponse.json({ success: false, error: 'O IXC recusou a criacao do prospect.' }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'Prospect criado no IXC.', id });
  } catch (error) {
    console.error('IXC prospect error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Nao foi possivel criar o prospect.' }, { status: 500 });
  }
}
