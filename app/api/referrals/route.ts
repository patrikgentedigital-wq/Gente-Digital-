import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/ratelimit';

const RefPattern = /^[A-Za-z0-9 _\-.\u00C0-\u024F]+$/;

const ReferralSchema = z.object({
  name: z.string().trim().min(3).max(100),
  phone: z.string().trim().min(10).max(30),
  ref: z.string().trim().max(50).optional(),
});

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
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
    if (!RefPattern.test(ref)) {
      return NextResponse.json({ success: false, error: 'Indicação inválida.' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
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
      .insert([{ name: parsed.data.name, phone, ref, status: 'Pendente', value: 0 }])
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

    const { error: historyError } = await supabase.from('lead_history').insert([{
      lead_id: lead.id,
      date: new Date().toLocaleString('pt-BR').substring(0, 16),
      action: 'Lead criado pela landing de indicação',
      note: `Contato recebido pelo programa Indique e Ganhe. Origem: ${ref}`,
    }]);

    if (historyError) {
      console.warn('Lead criado, mas o histórico não foi registrado:', historyError.message);
    }

    return NextResponse.json({ success: true, duplicate: false, leadId: lead.id }, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar indicação:', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível registrar a indicação. Tente novamente.' },
      { status: 500 },
    );
  }
}
