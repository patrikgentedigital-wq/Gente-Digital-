import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-server';
import { z } from 'zod';

const PayCommissionSchema = z.object({
  action: z.literal('pay'),
  commissionId: z.number().int().positive('ID de comissão inválido')
});

export async function GET(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(req);
    if (!isAuthenticated) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { data: commissions, error } = await supabase
      .from('commissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar comissões:', error.message);
      return NextResponse.json({ success: false, error: 'Erro ao buscar comissões.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, commissions });
  } catch (err: any) {
    console.error('Exceção ao buscar comissões:', err);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(req);
    if (!isAuthenticated) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = PayCommissionSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Payload inválido', details: parsed.error.format() }, { status: 400 });
    }

    const { commissionId } = parsed.data;

    const { data, error } = await supabase
      .from('commissions')
      .update({
        status: 'Paga',
        paid_at: new Date().toISOString()
      })
      .eq('id', commissionId)
      .select();

    if (error) {
      console.error('Erro ao atualizar comissão:', error.message);
      return NextResponse.json({ success: false, error: 'Erro ao processar pagamento.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, commission: data?.[0] });
  } catch (err: any) {
    console.error('Exceção ao pagar comissão:', err);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}
