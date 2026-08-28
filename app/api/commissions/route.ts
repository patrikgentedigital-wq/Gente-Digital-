import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth, getAuthenticatedUser, getUserRole } from '@/lib/auth-server';
import { z } from 'zod';

const PayCommissionSchema = z.object({
  action: z.literal('pay'),
  key: z.string().trim().min(1).max(100),
  colaboradorName: z.string().trim().min(1).max(150),
  leadName: z.string().trim().min(1).max(200),
  amount: z.number().nonnegative(),
  type: z.enum(['pix_colaborador', 'desconto_cliente', 'bonus_top']),
});

async function getRole(user: { id: string; email?: string | null; user_metadata?: any }): Promise<'admin' | 'vendedor'> {
  if (user.id === 'dev-local') return 'admin';
  return getUserRole(user.id, user.email, (user as any).user_metadata);
}

async function getAllowedColabNames(user: { id: string; email?: string | null }): Promise<string[]> {
  const userEmail = user.email || '';
  const orParts: string[] = [`user_id.eq.${user.id}`];
  if (userEmail) orParts.push(`email.ilike."${userEmail.replace(/"/g, '""')}"`);

  const { data: colabData } = await supabase
    .from('colaboradores')
    .select('name, id')
    .or(orParts.join(','));

  return (colabData || []).flatMap(c => [c.name, c.id]).filter(Boolean);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const role = await getRole(user);

    // Se Supabase não estiver configurado (dev local / demo)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      return NextResponse.json({ success: true, payments: [] });
    }

    let query = supabase
      .from('commission_payments')
      .select('*')
      .order('paid_at', { ascending: false });

    if (role !== 'admin') {
      // Vendedor só visualiza os próprios pagamentos de comissão
      const allowedNames = await getAllowedColabNames(user);

      if (allowedNames.length === 0) {
        return NextResponse.json({ success: true, payments: [] });
      }

      query = query.in('colaborador_name', allowedNames);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.warn('Aviso ao consultar commission_payments (tabela pode não ter sido criada ainda):', error.message);
      // Retornar lista vazia em vez de quebrar a página com erro 500
      return NextResponse.json({ success: true, payments: [], tableMissing: true });
    }

    return NextResponse.json({ success: true, payments });
  } catch (err: any) {
    console.error('Exceção ao buscar pagamentos:', err);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado. Faça login para dar baixa em comissões.' }, { status: 401 });
    }

    const role = await getRole(user);
    const rawBody = await req.json().catch(() => ({}));
    const parsed = PayCommissionSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Payload inválido', details: parsed.error.format() }, { status: 400 });
    }

    const { key, colaboradorName, leadName, amount, type } = parsed.data;

    // Não-admins só podem dar baixa em comissões vinculadas aos próprios nomes/IDs
    if (role !== 'admin') {
      const allowedNames = await getAllowedColabNames(user);
      if (!allowedNames.includes(colaboradorName)) {
        console.warn(`Acesso negado: ${user.email} tentou registrar pagamento para "${colaboradorName}".`);
        return NextResponse.json({ success: false, error: 'Você não tem permissão para registrar pagamento desta comissão.' }, { status: 403 });
      }
    }

    // Se Supabase não estiver configurado (dev local / demo)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      return NextResponse.json({ 
        success: true, 
        payment: {
          commission_ref: key,
          colaborador_name: colaboradorName,
          lead_name: leadName,
          amount,
          type,
          paid_at: new Date().toISOString()
        } 
      });
    }

    // 1. Tentar upsert com 'commission_ref' (padrão atual)
    let { data, error } = await supabase
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

    // 2. Fallback de compatibilidade caso a coluna no banco ainda se chame 'commission_key'
    if (error && (error.message.includes('commission_ref') || error.message.includes('commission_key'))) {
      console.warn('Tentando fallback com commission_key:', error.message);
      const fallbackResult = await supabase
        .from('commission_payments')
        .upsert({
          commission_key: key,
          colaborador_name: colaboradorName,
          lead_name: leadName,
          amount,
          type,
          paid_at: new Date().toISOString(),
        } as any, { onConflict: 'commission_key' as any })
        .select();

      if (!fallbackResult.error) {
        data = fallbackResult.data;
        error = null;
      }
    }

    if (error) {
      console.error('Erro ao registrar pagamento no Supabase:', error.message);
      return NextResponse.json({ 
        success: false, 
        error: `Erro ao registrar no banco de dados: ${error.message}. Certifique-se de executar a migration supabase_migration_commission_payments.sql no painel do Supabase.` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, payment: data?.[0] });
  } catch (err: any) {
    console.error('Exceção ao registrar pagamento:', err);
    return NextResponse.json({ success: false, error: err.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
