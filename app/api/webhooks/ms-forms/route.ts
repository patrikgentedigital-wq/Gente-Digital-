import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Received MS Forms webhook payload:', body);

    // Extract fields using flexible/common naming variations from Forms/Power Automate
    const name = (
      body.name || 
      body.nome || 
      body.Name ||
      body.Nome ||
      body['Nome Completo'] || 
      body['nome completo'] || 
      body['Full Name'] ||
      'Lead MS Forms'
    ).toString().trim();

    const phone = (
      body.phone || 
      body.telefone || 
      body.celular || 
      body.Phone ||
      body.Telefone ||
      body.whatsapp ||
      body.WhatsApp ||
      ''
    ).toString().trim();

    const ref = (
      body.ref || 
      body.referral || 
      body.colaborador || 
      body.Colaborador || 
      body['ID Indicador'] ||
      body.indicador ||
      'Orgânico'
    ).toString().trim();

    const rawValue = body.value || body.valor || body.Value || body.Valor || '0';
    const value = parseFloat(rawValue.toString().replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;

    // Check if Supabase is configured (avoid crashing on local mock state)
    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    let insertedLead = null;

    if (isSupabaseConfigured) {
      // 1. Insert Lead into Supabase
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert([{ name, phone, ref, status: 'Novas indicações', value }])
        .select();

      if (leadError) {
        throw leadError;
      }

      if (leadData && leadData[0]) {
        insertedLead = leadData[0];
        
        // 2. Insert Lead History Entry
        const historyData = {
          lead_id: insertedLead.id,
          date: new Date().toLocaleString('pt-BR').substring(0, 16),
          action: 'Criado via Webhook MS Forms',
          note: `Lead recebido automaticamente do Microsoft Forms. Canal de origem: ${ref}`
        };

        const { error: historyError } = await supabase
          .from('lead_history')
          .insert([historyData]);

        if (historyError) {
          console.error('Error inserting webhook history:', historyError);
        }
      }
    } else {
      // Mock insert response for development/mock mode
      insertedLead = {
        id: Math.floor(Math.random() * 1000) + 100,
        name,
        phone,
        ref,
        status: 'Novas indicações',
        value,
        created_at: new Date().toISOString()
      };
      console.log('Mocked MS Forms webhook registration (Supabase offline):', insertedLead);
    }

    return NextResponse.json(
      {
        message: 'Lead registrado com sucesso via Microsoft Forms Webhook',
        lead: insertedLead,
        supabaseSynced: isSupabaseConfigured
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('MS Forms Webhook Error:', error);
    return NextResponse.json(
      { error: 'Falha ao processar o webhook', details: error.message || error },
      { status: 500 }
    );
  }
}
