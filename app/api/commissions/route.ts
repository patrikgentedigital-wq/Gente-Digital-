import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isSameOriginRequest } from '@/lib/request-security';

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
    const { data, error } = await supabaseAdmin
      .from('commission_payments')
      .upsert({
        commission_ref: commissionRef,
        colaborador_name: colaboradorName,
        lead_name: leadName,
        amount,
        type,
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
