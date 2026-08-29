import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/ratelimit';
import { logger } from '@/lib/logger';

import { getIxcCredentials, formatIxcDate, fetchIxcWithTimeout } from '@/lib/ixc';

export const dynamic = 'force-dynamic';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

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
    const { cleanDomain, authHeader, hasCredentials } = await getIxcCredentials();

    if (!hasCredentials) {
      return { success: false, error: 'Credenciais IXC não configuradas' };
    }

    const payload = {
      nome: name,
      razao: name, // Necessário para salvar como Lead no IXC
      fone_celular: phone,
      id_filial: '1',
      data_cadastro: formatIxcDate(),
      lead: 'S',
      tipo_pessoa: 'F',
      origem: 'outros',
      obs: `Indicado via Gente Digital por: ${ref || 'Desconhecido'}`
    };

    const ixcResponse = await fetchIxcWithTimeout(`https://${cleanDomain}/webservice/v1/contato`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, 10000);

    if (!ixcResponse.ok) {
      const errorText = await ixcResponse.text().catch(() => '');
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
    // 1. Validação de Segurança (Token Secreto via Header ou Query)
    const secretFromQuery = req.nextUrl.searchParams.get('secret');
    const secretFromHeader = req.headers.get('x-webhook-secret');
    const secret = secretFromHeader || secretFromQuery;
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (secretFromQuery && !secretFromHeader) {
      logger.warn('Webhook MS Forms acessado com secret na URL (query parameter). Recomenda-se migrar para o header x-webhook-secret.');
    }

    if (!expectedSecret) {
      console.error("SEGURANÇA: WEBHOOK_SECRET não configurado no servidor.");
      return NextResponse.json({ success: false, error: 'Endpoint não configurado' }, { status: 503 });
    }
    
    let isValidSecret = false;
    if (secret && secret.length === expectedSecret.length) {
      try {
        isValidSecret = timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret));
      } catch (e) {
        isValidSecret = false;
      }
    }

    if (!isValidSecret) {
      console.warn("Tentativa de acesso não autorizado ao webhook MS Forms.");
      return NextResponse.json({ success: false, error: 'Não Autorizado: Token inválido' }, { status: 401 });
    }

    // 2. Rate Limit (por token secret / IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rateLimitKey = `msforms_webhook_${secret ? secret.slice(-6) : ip}`;
    const rateLimitResult = await checkRateLimit(rateLimitKey, 10, 60);

    if (!rateLimitResult.success) {
      logger.warn('Rate limit excedido no webhook MS Forms', { ip, secretSub: secret ? secret.slice(-6) : 'none' });
      return NextResponse.json(
        { success: false, error: 'Muitas requisições. Aguarde um momento.' },
        { status: 429 }
      );
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
    
    const rawPhone = findField(body, ['telefone', 'celular', 'whatsapp', 'phone', 'whats', 'fone', 'contato'], '');
    
    const externalRef = findField(body, ['responseid', 'id', 'response_id', 'submission_id', 'submissionid'], '');

    let ref = findField(body, ['colaborador', 'indicador', 'indicacao', 'ref', 'quem', 'vendedor', 'codigo', 'cod'], '');
    if (!ref && queryRef) {
      ref = queryRef.toString().trim();
    }
    if (!ref) {
      ref = 'Orgânico';
    }

    const rawValue = findField(body, ['valor', 'value', 'preco', 'preço', 'plano', 'mensalidade'], '0');

    // Parsing robusto de valor monetário (suporta "R$ 1.234,56", "1.234,56", "1234.56", "99,90")
    const value = (() => {
      const cleaned = rawValue.replace(/[^0-9.,]/g, '');
      if (!cleaned) return 0;
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      if (lastComma > lastDot) {
        // Formato brasileiro: vírgula decimal, ponto milhar
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
      }
      // Formato US: ponto decimal, vírgula milhar
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    })();

    // 3. Zod Validation das extrações
    const ExtractedDataSchema = z.object({
      name: z.string().max(100),
      phone: z.string().max(30),
      ref: z.string().max(50),
      value: z.number().nonnegative()
    });

    const parsedData = ExtractedDataSchema.safeParse({ name, phone: rawPhone, ref, value });
    if (!parsedData.success) {
      console.warn("Validação falhou para o payload extraído:", parsedData.error.format());
      return NextResponse.json({ success: false, error: 'Payload validation failed', details: parsedData.error.format() }, { status: 400 });
    }

    const validData = parsedData.data;
    const normalizedPhone = normalizePhone(validData.phone);

    // Check if Supabase is configured (avoid crashing on local mock state)
    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    let insertedLead = null;

    if (isSupabaseConfigured) {
      // 4. Deduplicação por external_ref e por telefone + janela de tempo
      const windowHours = parseInt(process.env.MSFORMS_DEDUP_WINDOW_HOURS || '72', 10);
      const sinceDate = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

      let existingLead: { id: number; name?: string; phone?: string } | null = null;

      if (externalRef) {
        const { data: refMatches } = await supabase
          .from('leads')
          .select('id, name, phone')
          .eq('external_ref', externalRef)
          .limit(1);
        if (refMatches && refMatches[0]) {
          existingLead = refMatches[0];
        }
      }

      if (!existingLead && normalizedPhone.length >= 10) {
        const { data: phoneMatches } = await supabase
          .from('leads')
          .select('id, name, phone')
          .eq('phone', normalizedPhone)
          .gte('created_at', sinceDate)
          .limit(1);
        if (phoneMatches && phoneMatches[0]) {
          existingLead = phoneMatches[0];
        }
      }

      if (existingLead) {
        logger.warn('Reenvio via MS Forms detectado e ignorado (Duplicata)', {
          existingLeadId: existingLead.id,
          phone: normalizedPhone,
          externalRef: externalRef || undefined,
          rawPayload: body,
        });

        await supabase.from('lead_history').insert([{
          lead_id: existingLead.id,
          date: new Date().toLocaleString('pt-BR').substring(0, 16),
          action: 'Reenvio via MS Forms detectado e ignorado',
          note: `Payload duplicado recebido. Telefone: ${normalizedPhone}${externalRef ? ` | Ref: ${externalRef}` : ''}`,
        }]);

        return NextResponse.json(
          { success: true, duplicate: true, leadId: existingLead.id, message: 'Lead duplicado ignorado' },
          { status: 200 }
        );
      }

      // 5. Insert Lead into Supabase
      const insertPayload: Record<string, any> = {
        name: validData.name,
        phone: normalizedPhone || validData.phone,
        ref: validData.ref,
        status: 'Pendente',
        value: validData.value,
        source: 'ms_forms'
      };
      if (externalRef) {
        insertPayload.external_ref = externalRef;
      }

      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert([insertPayload])
        .select();

      if (leadError) {
        throw leadError;
      }

      if (leadData && leadData[0]) {
        insertedLead = leadData[0];
        
        // Insert Lead History Entry
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

        // Enviar para o IXC Soft como prospect
        const ixcResult = await createIxcProspect(validData.name, normalizedPhone || validData.phone, validData.ref);
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
        phone: normalizedPhone || validData.phone,
        ref: validData.ref,
        status: 'Pendente',
        value: validData.value,
        source: 'ms_forms',
        external_ref: externalRef || null,
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
      { error: 'Falha ao processar o webhook.' },
      { status: 500 }
    );
  }
}
