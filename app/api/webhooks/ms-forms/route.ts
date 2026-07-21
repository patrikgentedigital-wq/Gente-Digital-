import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';

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

async function createIxcProspect(name: string, phone: string, ref: string) {
  try {
    // 1. Fetch credentials from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['ixc_domain', 'ixc_token']);

    if (settingsError) {
      console.warn("Could not read IXC credentials for webhook sync:", settingsError.message);
      return { success: false, error: 'Tabela settings não disponível no banco de dados' };
    }

    const config: Record<string, string> = {
      ixc_domain: process.env.IXC_DOMAIN || '',
      ixc_token: process.env.IXC_TOKEN || ''
    };

    if (settingsData && settingsData.length > 0) {
      settingsData.forEach((row: any) => {
        config[row.key] = row.value;
      });
    }

    const domain = config['ixc_domain'];
    const token = config['ixc_token'];

    if (!domain || !token) {
      return { success: false, error: 'Credenciais IXC não configuradas' };
    }

    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    const base64Token = Buffer.from(token).toString('base64');
    
    // Formatar data atual para o formato IXC (YYYY-MM-DD HH:MM:SS)
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 19).replace('T', ' ');

    const payload = {
      nome: name,
      razao: name, // Necessário para salvar como Lead no IXC
      fone_celular: phone,
      id_filial: '1',
      data_cadastro: localISOTime,
      lead: 'S',
      tipo_pessoa: 'F',
      origem: 'outros',
      obs: `Indicado via Gente Digital por: ${ref || 'Desconhecido'}`
    };

    const ixcResponse = await fetch(`https://${cleanDomain}/webservice/v1/contato`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!ixcResponse.ok) {
      const errorText = await ixcResponse.text();
      return { success: false, error: `Servidor IXC respondeu com código ${ixcResponse.status}: ${errorText}` };
    }

    const ixcData = await ixcResponse.json();

    if (ixcData.type === 'error') {
      return { success: false, error: ixcData.message };
    }

    return { success: true, id: ixcData.id };

  } catch (err: any) {
    console.error('Error in createIxcProspect helper:', err);
    return { success: false, error: err.message || err };
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validação de Segurança (Token Secreto)
    const secret = req.nextUrl.searchParams.get('secret');
    const expectedSecret = process.env.WEBHOOK_SECRET;
    
    let isValidSecret = false;
    if (secret && expectedSecret && secret.length === expectedSecret.length) {
      try {
        isValidSecret = timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret));
      } catch (e) {
        isValidSecret = false;
      }
    }

    if (expectedSecret && !isValidSecret) {
      console.warn("Tentativa de acesso não autorizado ao webhook detectada.");
      return NextResponse.json({ success: false, error: 'Não Autorizado: Token inválido' }, { status: 401 });
    }

    const body = await req.json();
    console.log('Received MS Forms webhook com chaves:', Object.keys(body || {}));

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

    // 2. Zod Validation das extrações
    const ExtractedDataSchema = z.object({
      name: z.string().max(100),
      phone: z.string().max(30),
      ref: z.string().max(50),
      value: z.number().nonnegative()
    });

    const parsedData = ExtractedDataSchema.safeParse({ name, phone, ref, value });
    if (!parsedData.success) {
      console.warn("Validação falhou para o payload extraído:", parsedData.error.format());
      return NextResponse.json({ success: false, error: 'Payload validation failed', details: parsedData.error.format() }, { status: 400 });
    }

    const validData = parsedData.data;

    // Check if Supabase is configured (avoid crashing on local mock state)
    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    let insertedLead = null;

    if (isSupabaseConfigured) {
      // 1. Insert Lead into Supabase
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert([{ name: validData.name, phone: validData.phone, ref: validData.ref, status: 'Pendente', value: validData.value }])
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

        // 3. Enviar para o IXC Soft como prospect
        const ixcResult = await createIxcProspect(validData.name, validData.phone, validData.ref);
        if (ixcResult.success) {
          await supabase
            .from('lead_history')
            .insert([{
              lead_id: insertedLead.id,
              date: new Date().toLocaleString('pt-BR').substring(0, 16),
              action: 'Sincronizado com IXC',
              note: `Prospect criado automaticamente no IXC com o ID: ${ixcResult.id}`
            }]);
        } else {
          await supabase
            .from('lead_history')
            .insert([{
              lead_id: insertedLead.id,
              date: new Date().toLocaleString('pt-BR').substring(0, 16),
              action: 'Falha na Sincronização IXC',
              note: `Erro ao enviar para o IXC: ${ixcResult.error}`
            }]);
        }
      }
    } else {
      // Mock insert response for development/mock mode
      insertedLead = {
        id: Math.floor(Math.random() * 1000) + 100,
        name: validData.name,
        phone: validData.phone,
        ref: validData.ref,
        status: 'Pendente',
        value: validData.value,
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
