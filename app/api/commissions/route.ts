import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth, verifyAuthAny, getAuthenticatedUser, getUserRole } from '@/lib/auth-server';
import { z } from 'zod';

const PayCommissionSchema = z.object({
  action: z.literal('pay'),
  key: z.string().trim().min(1).max(100),
  colaboradorName: z.string().trim().min(1).max(150),
  leadName: z.string().trim().min(1).max(200),
  amount: z.number().nonnegative(),
  type: z.enum(['pix_colaborador', 'desconto_cliente', 'bonus_top']),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const isDevLocal = user.id === 'dev-local';
    const role = isDevLocal ? 'admin' : await getUserRole(user.id);

    let query = supabase
      .from('commission_payments')
      .select('*')
      .order('paid_at', { ascending: false });

    if (role !== 'admin') {
      // Vendedor só visualiza os próprios pagamentos de comissão
      const userEmail = user.email || '';
      const { data: colabData } = await supabase
        .from('colaboradores')
        .select('name, id')
        .or(`user_id.eq.${user.id}${userEmail ? `,email.ilike.${userEmail}` : ''}`);

      const allowedNames = (colabData || []).flatMap(c => [c.name, c.id]).filter(Boolean);

      if (allowedNames.length === 0) {
        return NextResponse.json({ success: true, payments: [] });
      }

      query = query.in('colaborador_name', allowedNames);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error('Erro ao buscar pagamentos:', error.message);
      return NextResponse.json({ success: false, error: 'Erro ao buscar pagamentos.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, payments });
  } catch (err: any) {
    console.error('Exceção ao buscar pagamentos:', err);
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

    const { key, colaboradorName, leadName, amount, type } = parsed.data;

    const { data, error } = await supabase
      .from('commission_payments')
      .upsert({
        commission_ref: key,
        colaborador_name: colaboradorName,
        lead_name: leadName,
        amount,
        type,
        paid_at: new Date().toISOString(),
      }, { onConflict: 'commission_ref' })
      .select();

    if (error) {
      console.error('Erro ao registrar pagamento:', error.message);
      return NextResponse.json({ success: false, error: 'Erro ao registrar pagamento.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, payment: data?.[0] });
  } catch (err: any) {
    console.error('Exceção ao registrar pagamento:', err);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}
