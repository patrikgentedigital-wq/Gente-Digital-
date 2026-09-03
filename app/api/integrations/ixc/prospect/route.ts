import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuthAny } from '@/lib/auth-server';
import { getIxcCredentials, formatIxcDate, fetchIxcWithTimeout } from '@/lib/ixc';

const ProspectSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(8).max(30),
  ref: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuthAny(req);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = ProspectSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Nome e telefone válidos são obrigatórios', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { name, phone, ref } = parsed.data;

    // Fetch credentials via unified helper
    const { cleanDomain, authHeader, hasCredentials } = await getIxcCredentials();

    if (!hasCredentials) {
      return NextResponse.json({ success: false, error: 'IXC não configurado' }, { status: 400 });
    }

    const payload = {
      nome: name,
      razao: name,
      fone_celular: phone,
      id_filial: '1',
      data_cadastro: formatIxcDate(),
      lead: 'S',
      tipo_pessoa: 'F',
      origem: 'outros',
      obs: `Indicado via Gente Digital por: ${ref || 'Desconhecido'}`
    };

    const ixcResponse = await fetchIxcWithTimeout(`https://${cleanDomain}/webservice/v1/contato`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, 10000);

    if (!ixcResponse.ok) {
      const errorText = await ixcResponse.text().catch(() => '');
      console.error('IXC Prospect HTTP Error:', ixcResponse.status, errorText.slice(0, 200));
      return NextResponse.json({ success: false, error: `Servidor IXC respondeu com código ${ixcResponse.status}.` }, { status: 502 });
    }

    const ixcData = await ixcResponse.json();

    if (ixcData.type === 'error') {
      console.error('IXC Prospect Creation Error:', ixcData.message);
      return NextResponse.json({ success: false, error: ixcData.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Prospect criado no IXC', id: ixcData.id });

  } catch (error: any) {
    console.error('Create Prospect Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
