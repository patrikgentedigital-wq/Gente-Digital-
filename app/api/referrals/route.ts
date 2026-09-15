import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/ratelimit';
import { getIxcCredentials, formatIxcDate, fetchIxcWithTimeout } from '@/lib/ixc';

const RefPattern = /^[\p{L}\p{N}\s_\-.'()]+$/u;

const ReferralSchema = z.object({
  name: z.string().trim().min(3).max(100),
  phone: z.string().trim().min(10).max(30),
  ref: z.string().trim().max(50).optional(),
});

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

/**
 * Envia o lead como prospect para o IXC Soft com canal de venda preenchido.
 * Roda em background (fire-and-forget) para não atrasar a resposta ao usuário.
 */
async function sendToIxc(leadId: number, name: string, phone: string, ref: string) {
  try {
    const { cleanDomain, authHeader, hasCredentials } = await getIxcCredentials();
    if (!hasCredentials) return;

    const payload = {
      nome: name,
      razao: name,
      fone_celular: phone,
      id_filial: 1,
      data_cadastro: formatIxcDate(),
      lead: 'S',
      tipo_pessoa: 'F',
      origem: 'outros',
      id_candidato_tipo: 22,
      id_canal_origem: 22,
      id_canal_venda: 22,
      obs: `Indicado via Gente Digital por: ${ref || 'Desconhecido'}`,
    };

    const ixcResponse = await fetchIxcWithTimeout(`https://${cleanDomain}/webservice/v1/contato`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, 10000);

    const nowStr = new Date().toLocaleString('pt-BR').substring(0, 16);

    if (ixcResponse.ok) {
      const ixcData = await ixcResponse.json();
      if (ixcData.type !== 'error') {
        await supabase.from('lead_history').insert([{
          lead_id: leadId,
          date: nowStr,
          action: 'Sincronizado com IXC',
          note: `Prospect criado automaticamente no IXC com o ID: ${ixcData.id}`,
        }]);
      } else {
        await supabase.from('lead_history').insert([{
          lead_id: leadId,
          date: nowStr,
          action: 'Falha na Sincronização IXC',
          note: `Erro retornado pelo IXC: ${ixcData.message}`,
        }]);
      }
    } else {
      const errorText = await ixcResponse.text().catch(() => '');
      await supabase.from('lead_history').insert([{
        lead_id: leadId,
        date: nowStr,
        action: 'Falha na Sincronização IXC',
        note: `Servidor IXC respondeu com código ${ixcResponse.status}: ${errorText.slice(0, 200)}`,
      }]);
    }
  } catch (err: any) {
    console.error('Erro ao enviar prospect ao IXC (landing):', err.message || err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rateLimitResult = await checkRateLimit(`referrals_post_${ip}`, 5, 60);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Muitas tentativas em pouco tempo. Por favor, aguarde um minuto.' },
        { status: 429 },
      );
    }

    const parsed = ReferralSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Informe nome e telefone válidos.' },
        { status: 400 },
      );
    }

    const phone = normalizePhone(parsed.data.phone);
    if (phone.length < 10 || phone.length > 15) {
      return NextResponse.json(
        { success: false, error: 'Informe um telefone com DDD válido.' },
        { status: 400 },
      );
    }

    const cookieRef = req.cookies.get('gente_digital_ref')?.value || '';
    const ref = (parsed.data.ref || cookieRef || 'Orgânico').trim().slice(0, 50);
    if (ref && !RefPattern.test(ref)) {
      return NextResponse.json({ success: false, error: 'Indicação inválida.' }, { status: 400 });
    }

    const rawSbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (!rawSbUrl || rawSbUrl.includes('placeholder')) {
      return NextResponse.json(
        { success: false, error: 'O cadastro está temporariamente indisponível.' },
        { status: 503 },
      );
    }

    // Evita duplicar o mesmo contato e preserva a primeira atribuição recebida.
    const { data: existingLead, error: existingError } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', phone)
      .limit(1);

    if (existingError) throw existingError;
    if (existingLead?.[0]) {
      return NextResponse.json({ success: true, duplicate: true, leadId: existingLead[0].id }, { status: 200 });
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert([{
        name: parsed.data.name,
        phone,
        ref,
        status: 'Pendente',
        value: 0,
        source: 'landing',
        created_at: new Date().toISOString()
      }])
      .select('id')
      .single();

    if (leadError) {
      // Violação de unique (ex.: índice idx_leads_phone): outra requisição inseriu o mesmo
      // telefone primeiro. Recupera o lead existente e responde como duplicado.
      if ((leadError as any).code === '23505') {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('phone', phone)
          .limit(1);
        if (existing?.[0]) {
          return NextResponse.json({ success: true, duplicate: true, leadId: existing[0].id }, { status: 200 });
        }
      }
      throw leadError;
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const { error: historyError } = await supabase.from('lead_history').insert([{
      lead_id: lead.id,
      date: formattedDate,
      action: 'Lead criado pela landing de indicação',
      note: `Contato recebido pelo programa Indique e Ganhe. Origem: ${ref}`,
    }]);

    if (historyError) {
      console.warn('Lead criado, mas o histórico não foi registrado:', historyError.message);
    }

    // Enviar prospect ao IXC em background (não bloqueia a resposta ao usuário)
    sendToIxc(lead.id, parsed.data.name, phone, ref).catch(() => {});

    return NextResponse.json({ success: true, duplicate: false, leadId: lead.id }, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar indicação:', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível registrar a indicação. Tente novamente.' },
      { status: 500 },
    );
  }
}

