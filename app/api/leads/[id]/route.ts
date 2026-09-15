import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-server';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await verifyAuth(req);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;
    const idNum = Number(id);

    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json({ success: false, error: 'ID de lead inválido.' }, { status: 400 });
    }

    const leadId = idNum;

    // 0. Confere se o lead existe antes de apagar qualquer coisa
    const { data: existingLead, error: findError } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .maybeSingle();

    if (findError) {
      console.error(`Erro ao buscar lead ${leadId} antes da exclusão:`, findError.message);
      return NextResponse.json({ success: false, error: 'Erro ao localizar o lead antes da exclusão.' }, { status: 500 });
    }

    if (!existingLead) {
      return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 });
    }

    // 1. Apaga o histórico vinculado ao lead
    const { error: historyError } = await supabase
      .from('lead_history')
      .delete()
      .eq('lead_id', leadId);

    if (historyError) {
      console.warn(`Aviso ao apagar histórico do lead ${leadId}:`, historyError.message);
    }

    // 2. Apaga o lead no banco de dados usando supabaseAdmin (ignora RLS)
    const { error: leadError } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (leadError) {
      console.error(`Erro ao apagar lead ${leadId}:`, leadError.message);
      return NextResponse.json({ success: false, error: `Não foi possível excluir o lead: ${leadError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Lead ${leadId} excluído com sucesso.` });
  } catch (err: any) {
    console.error('Erro no endpoint de deleção de lead:', err);
    return NextResponse.json({ success: false, error: err.message || 'Erro ao excluir o lead.' }, { status: 500 });
  }
}
