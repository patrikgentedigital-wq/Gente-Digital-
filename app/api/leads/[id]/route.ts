import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id, 10);

    if (isNaN(leadId)) {
      return NextResponse.json({ success: false, error: 'ID de lead inválido.' }, { status: 400 });
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
      return NextResponse.json({ success: false, error: leadError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Lead ${leadId} excluído com sucesso.` });
  } catch (err: any) {
    console.error('Erro no endpoint de deleção de lead:', err);
    return NextResponse.json({ success: false, error: err.message || 'Erro ao excluir o lead.' }, { status: 500 });
  }
}
