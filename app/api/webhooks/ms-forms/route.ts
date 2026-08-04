import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPublicRateLimit } from '@/lib/rate-limit';
import { claimWebhookEvent, completeWebhookEvent, readWebhookBody, verifyLegacyWebhook, verifySignedWebhook } from '@/lib/webhook-security';
import { fetchIxc, formatIxcDate, getIxcConfig } from '@/lib/ixc';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

const FormPayloadSchema = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length <= 100, {
  message: 'Payload muito grande',
});

const ExtractedDataSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\d{10,13}$/),
  ref: z.string().trim().min(1).max(50),
  value: z.number().finite().nonnegative().max(10_000_000),
});

function normalizeString(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function findField(body: Record<string, unknown>, keywords: string[]) {
  const keys = Object.keys(body);
  const exactKeywords = keywords.map((keyword) => keyword.toLowerCase().trim());

  for (const key of keys) {
    if (!exactKeywords.includes(key.toLowerCase().trim())) continue;
    const value = body[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }

  for (const key of keys) {
    const normalizedKey = normalizeString(key);
    if (!keywords.some((keyword) => normalizedKey.includes(normalizeString(keyword)))) continue;
    const value = body[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }

  return '';
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^0-9,.-]/g, '').replace(/(?!^)-/g, '');
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : 0;
}

async function createIxcProspect(name: string, phone: string, ref: string) {
  try {
    const config = await getIxcConfig();
    if (!config) return { success: false as const };

    const response = await fetchIxc(`${config.host}/webservice/v1/contato`, config.token, {
      nome: name,
      razao: name,
      fone_celular: phone,
      id_filial: '1',
      data_cadastro: formatIxcDate(),
      lead: 'S',
      tipo_pessoa: 'F',
      origem: 'outros',
      obs: `Indicado via Gente Digital por: ${ref}`,
    }, 'insert');

    const responseBody = await response.text();
    let data: { id?: string | number; type?: string } = {};
    try {
      data = JSON.parse(responseBody) as { id?: string | number; type?: string };
    } catch {
      // A resposta não JSON é tratada como falha sem devolvê-la ao cliente.
    }

    const id = data.id ? String(data.id).trim().slice(0, 100) : '';
    if (!response.ok || data.type === 'error' || !id) {
      console.error('IXC não confirmou a criação do prospecto:', response.status);
      return { success: false as const };
    }
    return { success: true as const, id };
  } catch (error) {
    console.error('Falha na sincronização do prospect com o IXC:', error instanceof Error ? error.message : 'erro desconhecido');
    return { success: false as const };
  }
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicRateLimit('webhook-ms-forms', request);
  if (!rateLimit.success) {
    return noStoreJson({ success: false, error: rateLimit.unavailable ? 'Endpoint temporariamente indisponível.' : 'Muitas requisições.' }, rateLimit.unavailable ? 503 : 429);
  }

  if (!isSupabaseAdminConfigured()) return noStoreJson({ success: false, error: 'Endpoint temporariamente indisponível.' }, 503);

  const rawBody = await readWebhookBody(request);
  if (rawBody === null) return noStoreJson({ success: false, error: 'Payload inválido.' }, 413);

  const signed = verifySignedWebhook(request, rawBody, process.env.WEBHOOK_SECRET)
    || verifyLegacyWebhook(request, rawBody, process.env.WEBHOOK_SECRET);
  if (!signed) return noStoreJson({ success: false, error: 'Não autorizado.' }, 401);

  let claim: { duplicate: boolean; conflict: boolean };
  try {
    claim = await claimWebhookEvent('ms-forms', signed);
  } catch (error) {
    console.error('Falha ao registrar idempotência do webhook MS Forms:', error instanceof Error ? error.message : 'erro desconhecido');
    return noStoreJson({ success: false, error: 'Não foi possível processar o webhook.' }, 500);
  }
  if (claim.conflict) return noStoreJson({ success: false, error: 'Identificador de evento já utilizado.' }, 409);
  if (claim.duplicate) return noStoreJson({ success: true, duplicate: true }, 200);

  try {
    const decoded: unknown = JSON.parse(rawBody);
    const bodyResult = FormPayloadSchema.safeParse(decoded);
    if (!bodyResult.success) {
      await completeWebhookEvent('ms-forms', signed.eventId, 'failed');
      return noStoreJson({ success: false, error: 'Payload inválido.' }, 400);
    }

    const body = bodyResult.data;
    const queryRef = request.nextUrl.searchParams.get('ref')
      || request.nextUrl.searchParams.get('referral')
      || request.nextUrl.searchParams.get('colaborador')
      || request.nextUrl.searchParams.get('indicador')
      || '';
    const rawRef = findField(body, ['colaborador', 'indicador', 'indicacao', 'ref', 'quem', 'vendedor', 'codigo', 'cod']) || queryRef;
    const rawName = findField(body, ['nome', 'name', 'cliente', 'lead', 'completo']);
    const rawPhone = normalizePhone(findField(body, ['telefone', 'celular', 'whatsapp', 'phone', 'whats', 'fone', 'contato']));
    const rawValue = findField(body, ['valor', 'value', 'preco', 'preço', 'plano', 'mensalidade']) || '0';
    const parsedData = ExtractedDataSchema.safeParse({
      name: rawName,
      phone: rawPhone,
      ref: rawRef || 'Organico',
      value: parseMoney(rawValue),
    });

    if (!parsedData.success) {
      await completeWebhookEvent('ms-forms', signed.eventId, 'failed');
      return noStoreJson({ success: false, error: 'Payload inválido.' }, 400);
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .insert({
        name: parsedData.data.name.normalize('NFC').replace(/\s+/g, ' '),
        phone: parsedData.data.phone,
        ref: parsedData.data.ref,
        status: 'Pendente',
        value: parsedData.data.value,
        source: 'ms_forms_webhook',
      })
      .select('id')
      .single();

    if (leadError || !lead) throw leadError || new Error('lead_not_created');

    await supabaseAdmin.from('lead_history').insert({
      lead_id: lead.id,
      date: new Date().toISOString(),
      action: 'Criado via Webhook MS Forms',
      note: `Lead recebido automaticamente. Canal de origem: ${parsedData.data.ref}`,
    });

    const ixcResult = await createIxcProspect(parsedData.data.name, parsedData.data.phone, parsedData.data.ref);
    await supabaseAdmin.from('lead_history').insert({
      lead_id: lead.id,
      date: new Date().toISOString(),
      action: ixcResult.success ? 'Sincronizado com IXC' : 'Falha na Sincronização IXC',
      note: ixcResult.success
        ? `Prospect criado automaticamente no IXC com o ID: ${ixcResult.id}.`
        : 'O IXC não confirmou a criação do prospecto.',
    });

    await completeWebhookEvent('ms-forms', signed.eventId, 'completed');
    return noStoreJson({ success: true, leadId: lead.id }, 201);
  } catch (error) {
    await completeWebhookEvent('ms-forms', signed.eventId, 'failed');
    console.error('Erro interno no webhook MS Forms:', error instanceof Error ? error.message : 'erro desconhecido');
    return noStoreJson({ success: false, error: 'Falha ao processar o webhook.' }, 500);
  }
}
