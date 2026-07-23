import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const { data: commissions, error } = await supabase
      .from('commissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar comissões:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, commissions });
  } catch (err: any) {
    console.error('Exceção ao buscar comissões:', err.message);
    return NextResponse.json({ success: false, error: err.message || 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, commissionId } = body;

    if (action === 'pay') {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'Paga',
          paid_at: new Date().toISOString()
        })
        .eq('id', commissionId)
        .select();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, commission: data?.[0] });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
