import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPublicRateLimit } from '@/lib/rate-limit';
import { normalizePhone, normalizeReferralCode, normalizeTrackingCode } from '@/lib/referrals';
import { supabaseAdmin } from '@/lib/supabase-admin';

const SubmitReferralSchema = z.object({
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(10).max(13),
  ref: z.string().trim().max(50).optional().default(''),
  consent: z.literal(true),
  submissionKey: z.string().uuid(),
});

const NAME_PATTERN = /^[\p{L}\p{M} .'-]+$/u;

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder'),
  );
}

function makeTrackingCode() {
  const raw = randomBytes(8).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g)?.join('-') || raw;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function findExistingSubmission(submissionKey: string) {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('tracking_code')
    .eq('submission_key', submissionKey)
    .maybeSingle();

  return normalizeTrackingCode(data?.tracking_code);
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicRateLimit('referral-submit', request);
  if (!rateLimit.success) {
    return noStoreJson({ success: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, 429);
  }

  if (!isConfigured()) {
    return noStoreJson({ success: false, error: 'O cadastro está temporariamente indisponível. Tente novamente em instantes.' }, 503);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = SubmitReferralSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreJson({ success: false, error: 'Confira nome, telefone e autorização para contato.' }, 400);
    }

    const name = parsed.data.name.normalize('NFC').replace(/\s+/g, ' ');
    const phone = normalizePhone(parsed.data.phone);
    const ref = parsed.data.ref ? normalizeReferralCode(parsed.data.ref) : 'Orgânico';
    if (!NAME_PATTERN.test(name) || phone.length < 10 || (parsed.data.ref && !ref)) {
      return noStoreJson({ success: false, error: 'Confira os dados informados e tente novamente.' }, 400);
    }

    const trackingCode = makeTrackingCode();
    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        name,
        phone,
        ref,
        status: 'Pendente',
        value: 0,
        responsible: 'Admin',
        source: 'referral_landing',
        consent_at: new Date().toISOString(),
        submission_key: parsed.data.submissionKey,
        tracking_code: trackingCode,
      })
      .select('id, tracking_code, status, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        const existingCode = await findExistingSubmission(parsed.data.submissionKey);
        if (existingCode) return noStoreJson({ success: true, trackingCode: existingCode });
      }
      console.error('Erro ao registrar indicação pública:', error.message);
      return noStoreJson({ success: false, error: 'Não foi possível registrar a indicação.' }, 500);
    }

    if (lead?.id) {
      const { error: historyError } = await supabaseAdmin.from('lead_history').insert({
        lead_id: lead.id,
        date: new Date().toLocaleString('pt-BR'),
        action: 'Indicação recebida pela landing pública',
        note: `Origem: ${ref}`,
      });
      if (historyError) console.error('Indicação criada sem histórico:', historyError.message);
    }

    return noStoreJson({ success: true, trackingCode: normalizeTrackingCode(lead?.tracking_code) });
  } catch (error) {
    console.error('Exceção ao registrar indicação pública:', error);
    return noStoreJson({ success: false, error: 'Não foi possível registrar a indicação.' }, 500);
  }
}

export async function GET(request: NextRequest) {
  const rateLimit = await checkPublicRateLimit('referral-status', request);
  if (!rateLimit.success) {
    return noStoreJson({ success: false, error: 'Muitas consultas. Aguarde um minuto e tente novamente.' }, 429);
  }

  if (!isConfigured()) {
    return noStoreJson({ success: false, error: 'A consulta está temporariamente indisponível.' }, 503);
  }

  const code = normalizeTrackingCode(request.nextUrl.searchParams.get('code'));
  if (!code) return noStoreJson({ success: false, error: 'Código de acompanhamento inválido.' }, 400);

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('tracking_code, status, created_at, ref')
    .eq('tracking_code', code)
    .maybeSingle();

  if (error) {
    console.error('Erro ao consultar indicação:', error.message);
    return noStoreJson({ success: false, error: 'Não foi possível consultar a indicação.' }, 500);
  }
  if (!data) return noStoreJson({ success: false, error: 'Código não encontrado. Confira a sequência informada.' }, 404);

  return noStoreJson({
    success: true,
    code: data.tracking_code,
    status: data.status,
    createdAt: data.created_at,
    ref: data.ref || 'Orgânico',
  });
}
