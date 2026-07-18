import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, "");     // remove caracteres especiais e espaços
}

function findField(body: any, keywords: string[], defaultValue: string = ''): string {
  if (!body || typeof body !== 'object') return defaultValue;

  const keys = Object.keys(body);
  
  // 1. Procura por correspondência direta de palavra-chave
  for (const key of keys) {
    const cleanKey = key.toLowerCase().trim();
    if (keywords.includes(cleanKey)) {
      const val = body[key];
      if (val !== undefined && val !== null) {
        return val.toString().trim();
      }
    }
  }

  // 2. Procura por correspondência difusa nas perguntas (substrings)
  for (const key of keys) {
    const normKey = normalizeString(key);
    for (const kw of keywords) {
      const normKw = normalizeString(kw);
      if (normKey.includes(normKw)) {
        const val = body[key];
        if (val !== undefined && val !== null) {
          return val.toString().trim();
        }
      }
    }
  }

  return defaultValue;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Received MS Forms webhook payload:', body);

    // Captura parâmetros da query URL (?ref=... ou ?colaborador=...)
    const url = new URL(req.url);
    const queryRef = url.searchParams.get('ref') || 
                     url.searchParams.get('referral') || 
                     url.searchParams.get('colaborador') || 
                     url.searchParams.get('indicador');

    // Mapeamento inteligente usando palavras-chave comuns em português/inglês
    const name = findField(body, ['nome', 'name', 'cliente', 'lead', 'completo'], 'Lead MS Forms');
    
    const phone = findField(body, ['telefone', 'celular', 'whatsapp', 'phone', 'whats', 'fone', 'contato'], '');
    
    let ref = findField(body, ['colaborador', 'indicador', 'indicacao', 'ref', 'quem', 'vendedor', 'codigo', 'cod'], '');
    if (!ref && queryRef) {
      ref = queryRef.toString().trim();
    }
    if (!ref) {
      ref = 'Orgânico';
    }

    const rawValue = findField(body, ['valor', 'value', 'preco', 'preço', 'plano', 'mensalidade'], '0');
    const value = parseFloat(rawValue.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;

    // Check if Supabase is configured (avoid crashing on local mock state)
    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    let insertedLead = null;

    if (isSupabaseConfigured) {
      // 1. Insert Lead into Supabase
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert([{ name, phone, ref, status: 'Pendente', value }])
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
        status: 'Pendente',
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
