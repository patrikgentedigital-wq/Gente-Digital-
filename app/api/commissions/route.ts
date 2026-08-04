import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isSameOriginRequest } from '@/lib/request-security';
import { matchCollaboratorReference } from '@/lib/referral-matching';
import { PROGRAM_RULES } from '@/lib/rules';

const PayCommissionSchema = z.object({
  action: z.literal('pay'),
  commissionRef: z.string().trim().min(1).max(100),
  colaboradorName: z.string().trim().min(1).max(150),
  leadName: z.string().trim().min(1).max(200),
  amount: z.number().finite().nonnegative().max(10_000_000),
  type: z.enum(['pix_colaborador', 'desconto_cliente', 'bonus_top']),
  paymentReference: z.string().trim().min(3).max(120),
});

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function resolveCommission(commissionRef: string, fallbackName: string, fallbackLeadName: string) {
  if (commissionRef.startsWith('bonus_top_')) {
    return {
      collaboratorName: fallbackName,
      leadName: fallbackLeadName,
      amount: PROGRAM_RULES.bonusTop.valor,
      type: 'bonus_top' as const,
    };
  }

  const leadId = Number(commissionRef.replace(/^comm_/, ''));
  if (!Number.isInteger(leadId) || leadId <= 0) return null;

  const [{ data: lead, error: leadError }, { data: collaborators, error: collaboratorsError }] = await Promise.all([
    supabaseAdmin
      .from('leads')
      .select('id, name, ref, created_at')
      .eq('id', leadId)
      .maybeSingle(),
    supabaseAdmin
      .from('colaboradores')
      .select('id, name'),
  ]);

  if (leadError || collaboratorsError || !lead) return null;

  const collaborator = matchCollaboratorReference(lead.ref, collaborators || []);
  if (!collaborator) {
    return {
      collaboratorName: lead.ref || 'Cliente Indicador',
      leadName: lead.name,
      amount: PROGRAM_RULES.clienteIndicador.descontoMensalidade,
      type: 'desconto_cliente' as const,
    };
  }

  const leadDate = lead.created_at ? new Date(lead.created_at) : new Date();
  const monthStart = new Date(leadDate.getFullYear(), leadDate.getMonth(), 1);
  const nextMonthStart = new Date(leadDate.getFullYear(), leadDate.getMonth() + 1, 1);
  const { data: monthlyLeads, error: monthlyLeadsError } = await supabaseAdmin
    .from('leads')
    .select('ref, created_at')
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', nextMonthStart.toISOString());

  if (monthlyLeadsError) return null;

  const monthlyCount = (monthlyLeads || []).filter((item) => (
    matchCollaboratorReference(item.ref, collaborators || [])?.id === collaborator.id
  )).length;

  return {
    collaboratorName: collaborator.name,
    leadName: lead.name,
    amount: monthlyCount >= PROGRAM_RULES.colaborador.volumeThreshold
      ? PROGRAM_RULES.colaborador.taxaVolume
      : PROGRAM_RULES.colaborador.taxaPorVenda,
    type: 'pix_colaborador' as const,
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) return noStoreJson({ success: false, error: 'Não autorizado.' }, 401);

    const { data: payments, error } = await supabaseAdmin
      .from('commission_payments')
      .select('commission_ref, paid_at, payment_reference, status, type, confirmed_by, confirmation_source')
      .order('paid_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar baixas de comissão:', error.message);
      return noStoreJson({ success: false, error: 'Erro ao buscar baixas de comissão.' }, 500);
    }

    return noStoreJson({ success: true, payments: payments || [] });
  } catch (error) {
    console.error('Exceção ao buscar baixas de comissão:', error);
    return noStoreJson({ success: false, error: 'Erro interno do servidor.' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) return noStoreJson({ success: false, error: 'Origem nao permitida.' }, 403);
    const admin = await getAdminUser(request);
    if (!admin) return noStoreJson({ success: false, error: 'Não autorizado.' }, 401);

    const rawBody = await request.json().catch(() => ({}));
    const parsed = PayCommissionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return noStoreJson({ success: false, error: 'Informe a referência do comprovante antes de confirmar a baixa.' }, 400);
    }

    const { commissionRef, colaboradorName, leadName, amount, type, paymentReference } = parsed.data;
    const resolved = await resolveCommission(commissionRef, colaboradorName, leadName);
    if (!resolved) {
      return noStoreJson({ success: false, error: 'Comissão não encontrada ou sem dados suficientes para validação.' }, 400);
    }
    if (resolved.type !== type || Math.abs(resolved.amount - amount) > 0.001) {
      return noStoreJson({ success: false, error: 'Valor ou tipo de comissão não confere com os dados do lead.' }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('commission_payments')
      .upsert({
        commission_ref: commissionRef,
        colaborador_name: resolved.collaboratorName,
        lead_name: resolved.leadName,
        amount: resolved.amount,
        type: resolved.type,
        status: 'baixa_registrada',
        payment_reference: paymentReference,
        confirmation_source: 'manual_admin',
        confirmed_by: admin.id === 'local-development' ? null : admin.id,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'commission_ref' })
      .select('commission_ref, paid_at, payment_reference, status, type, confirmed_by, confirmation_source')
      .single();

    if (error) {
      console.error('Erro ao registrar baixa de comissão:', error.message);
      return noStoreJson({ success: false, error: 'Erro ao registrar a baixa no banco.' }, 500);
    }

    return noStoreJson({ success: true, payment: data });
  } catch (error) {
    console.error('Exceção ao registrar baixa de comissão:', error);
    return noStoreJson({ success: false, error: 'Erro interno do servidor.' }, 500);
  }
}
