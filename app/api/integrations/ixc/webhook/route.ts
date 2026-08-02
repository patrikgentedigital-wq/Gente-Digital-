import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPublicRateLimit } from '@/lib/rate-limit';
import { claimWebhookEvent, completeWebhookEvent, readWebhookBody, verifySignedWebhook } from '@/lib/webhook-security';
import { fetchIxc, getIxcConfig } from '@/lib/ixc';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

const WebhookObjectSchema = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length <= 100, {
  message: 'Payload muito grande',
});

const ExtractedPayloadSchema = z.object({
  clientName: z.string().trim().max(160),
  clientPhone: z.string().trim().max(40),
  clientId: z.string().trim().max(80),
  contractValue: z.number().finite().nonnegative().max(10_000_000),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function parseMoney(value: unknown) {
  const raw = String(value ?? '').replace(/[^0-9,.-]/g, '').replace(/(?!^)-/g, '');
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : 0;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function getContractValue(clientId: string, currentValue: number) {
  if (currentValue > 0 || !clientId) return currentValue;

  try {
    const config = await getIxcConfig();
    if (!config) return 0;
    const response = await fetchIxc(`${config.host}/webservice/v1/cliente_contrato`, config.token, {
      qtype: 'id_cliente',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '10',
    });
    if (!response.ok) return 0;

    const parsed: unknown = await response.json().catch(() => null);
    const body = asRecord(parsed);
    const records = body && Array.isArray(body.registros) ? body.registros : [];
    const active = records
      .map(asRecord)
      .filter((record): record is Record<string, unknown> => Boolean(record))
      .find((record) => String(record.status || '') === 'A') || asRecord(records[0]);
    return active ? parseMoney(active.valor || active.valor_total || active.mensalidade) : 0;
  } catch (error) {
    console.warn('Falha ao consultar contrato no IXC:', error instanceof Error ? error.message : 'erro desconhecido');
    return 0;
  }
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicRateLimit('webhook-ixc', request);
  if (!rateLimit.success) {
    return noStoreJson({ success: false, error: rateLimit.unavailable ? 'Endpoint temporariamente indisponível.' : 'Muitas requisições.' }, rateLimit.unavailable ? 503 : 429);
  }

  if (!isSupabaseAdminConfigured()) return noStoreJson({ success: false, error: 'Endpoint temporariamente indisponível.' }, 503);

  const rawBody = await readWebhookBody(request);
  if (rawBody === null) return noStoreJson({ success: false, error: 'Payload inválido.' }, 413);

  const signed = verifySignedWebhook(request, rawBody, process.env.IXC_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET);
  if (!signed) return noStoreJson({ success: false, error: 'Não autorizado.' }, 401);

  let claim: { duplicate: boolean; conflict: boolean };
  try {
    claim = await claimWebhookEvent('ixc', signed);
  } catch (error) {
    console.error('Falha ao registrar idempotência do webhook IXC:', error instanceof Error ? error.message : 'erro desconhecido');
    return noStoreJson({ success: false, error: 'Não foi possível processar o webhook.' }, 500);
  }
  if (claim.conflict) return noStoreJson({ success: false, error: 'Identificador de evento já utilizado.' }, 409);
  if (claim.duplicate) return noStoreJson({ success: true, duplicate: true }, 200);

  try {
    const decoded: unknown = JSON.parse(rawBody);
    const rootResult = WebhookObjectSchema.safeParse(decoded);
    if (!rootResult.success) {
      await completeWebhookEvent('ixc', signed.eventId, 'failed');
      return noStoreJson({ success: false, error: 'Payload inválido.' }, 400);
    }

    const root = rootResult.data;
    const payload = asRecord(root.data) || asRecord(root.registro) || root;
    const extracted = ExtractedPayloadSchema.safeParse({
      clientName: getString(payload, ['razao', 'nome', 'cliente_nome', 'client_name']),
      clientPhone: getString(payload, ['telefone_celular', 'telefone', 'cellphone', 'phone']),
      clientId: getString(payload, ['id_cliente', 'cliente_id', 'client_id']),
      contractValue: parseMoney(getString(payload, ['valor', 'valor_total', 'mensalidade', 'valor_contrato'])),
    });

    if (!extracted.success || (!extracted.data.clientName && !extracted.data.clientPhone && !extracted.data.clientId)) {
      await completeWebhookEvent('ixc', signed.eventId, 'failed');
      return noStoreJson({ success: false, error: 'Payload sem identificação válida.' }, 400);
    }

    const { data: pendingLeads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, value, status')
      .neq('status', 'Ganho')
      .limit(500);
    if (leadsError) throw leadsError;

    const phone = normalizePhone(extracted.data.clientPhone);
    const name = normalizeName(extracted.data.clientName);
    const matches = (pendingLeads || []).filter((lead) => {
      const phoneMatches = phone.length >= 10 && normalizePhone(String(lead.phone || '')) === phone;
      const nameMatches = name.length >= 2 && normalizeName(String(lead.name || '')) === name;
      return phoneMatches || nameMatches;
    });

    if (matches.length === 0) {
      await completeWebhookEvent('ixc', signed.eventId, 'completed');
      return noStoreJson({ success: true, matched: false });
    }
    if (matches.length > 1) {
      await completeWebhookEvent('ixc', signed.eventId, 'failed');
      return noStoreJson({ success: false, error: 'Mais de um lead corresponde ao evento.' }, 409);
    }

    const contractValue = await getContractValue(extracted.data.clientId, extracted.data.contractValue);
    const updateFields: { status: string; value?: number } = { status: 'Ganho' };
    if (contractValue > 0) updateFields.value = contractValue;

    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update(updateFields)
      .eq('id', matches[0].id)
      .neq('status', 'Ganho');
    if (updateError) throw updateError;

    await supabaseAdmin.from('lead_history').insert({
      lead_id: matches[0].id,
      date: new Date().toISOString(),
      action: 'Convertido via Webhook IXC Soft',
      note: contractValue > 0 ? 'Contrato ativado no IXC Soft.' : 'Contrato ativado no IXC Soft; valor não informado.',
    });

    await completeWebhookEvent('ixc', signed.eventId, 'completed');
    return noStoreJson({ success: true, matched: true }, 200);
  } catch (error) {
    await completeWebhookEvent('ixc', signed.eventId, 'failed');
    console.error('Erro interno no webhook IXC:', error instanceof Error ? error.message : 'erro desconhecido');
    return noStoreJson({ success: false, error: 'Falha ao processar o webhook.' }, 500);
  }
}
