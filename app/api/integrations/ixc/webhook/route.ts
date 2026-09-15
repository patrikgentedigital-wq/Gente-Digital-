import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { timingSafeEqual } from 'crypto';
import { getIxcCredentials, fetchIxcWithTimeout } from '@/lib/ixc';
import { logger } from '@/lib/logger';

/**
 * Parsing robusto de valor monetário BR (idêntico ao do webhook ms-forms):
 * suporta "R$ 1.234,56", "1.234,56", "1234.56" e "99,90".
 */
function parseBrValue(raw: any): number {
  const cleaned = String(raw ?? '').replace(/[^0-9.,]/g, '');
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Formato brasileiro: vírgula decimal, ponto de milhar
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Formato US: ponto decimal, vírgula de milhar
  return parseFloat(cleaned.replace(/,/g, '')) || 0;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validação de Segurança (Token Secreto Obrigatório via Header ou Query)
    const secretFromHeader = req.headers.get('x-webhook-secret');
    const secretFromQuery = req.nextUrl.searchParams.get('secret');
    const secret = secretFromHeader || secretFromQuery;
    const expectedSecret = process.env.IXC_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
    
    if (secretFromQuery && !secretFromHeader) {
      console.warn('Webhook IXC acessado com secret na URL (query parameter). Recomenda-se migrar para o header x-webhook-secret.');
    }
    
    if (!expectedSecret) {
      console.error("SEGURANÇA: IXC_WEBHOOK_SECRET / WEBHOOK_SECRET não configurado no servidor.");
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
      console.warn("Tentativa de acesso não autorizado ao Webhook IXC.");
      return NextResponse.json({ success: false, error: 'Não Autorizado: Token de webhook inválido' }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => ({}));
    logger.info('IXC Webhook recebido');

    // Support both direct IXC trigger payloads and standard webhook formats
    const payload = rawBody.data || rawBody.registro || rawBody;
    
    const clientName = payload.razao || payload.nome || payload.cliente_nome || payload.client_name || '';
    const clientPhone = payload.telefone_celular || payload.telefone || payload.cellphone || payload.phone || '';
    const clientId = payload.id_cliente || payload.cliente_id || payload.client_id || '';
    const contractStatus = payload.status || payload.contrato_status || 'A';

    // Só considera o contrato "ativo" para marcar o lead como Ganho
    const isContractActive = ['a', 'ativo'].includes(String(contractStatus).trim().toLowerCase());
    if (!isContractActive) {
      logger.info(`Webhook IXC recebido com contrato não ativo (status: "${contractStatus}"). Nenhum lead será marcado como Ganho.`);
      return NextResponse.json({
        success: true,
        message: `Contrato do IXC não está ativo (status: ${contractStatus}). Nenhum lead atualizado.`
      });
    }

    // Parse contract value if provided in webhook payload
    let contractValue = parseBrValue(payload.valor || payload.valor_total || payload.mensalidade || payload.valor_contrato || '0');

    if (!clientName && !clientPhone && !clientId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Payload de webhook recebido, porém sem identificação de cliente/lead.' 
      }, { status: 400 });
    }

    // Check IXC credentials to fetch contract value if missing in payload
    const { cleanDomain, authHeader, hasCredentials } = await getIxcCredentials();

    // 1. Find matching lead in Supabase (not already marked as Ganho) — paginado para bases grandes
    const pendingLeads: any[] = [];
    let leadsErrorMessage: string | null = null;
    let leadsPage = 0;

    while (true) {
      const { data: pageLeads, error: pageError } = await supabase
        .from('leads')
        .select('id, name, phone, status, value, ref')
        .not('status', 'eq', 'Ganho')
        .range(leadsPage * 1000, (leadsPage + 1) * 1000 - 1);

      if (pageError) {
        leadsErrorMessage = pageError.message;
        break;
      }

      if (pageLeads && pageLeads.length > 0) {
        pendingLeads.push(...pageLeads);
      }

      if (!pageLeads || pageLeads.length < 1000) break;
      leadsPage++;
    }

    if (leadsErrorMessage) {
      console.error('Error querying leads for IXC webhook:', leadsErrorMessage);
      return NextResponse.json({ success: false, error: leadsErrorMessage }, { status: 500 });
    }

    if (!pendingLeads || pendingLeads.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook processado, mas nenhum lead pendente foi encontrado no sistema.' 
      });
    }

    const cleanPhone = (s: string) => (s ? s.replace(/\D/g, '') : '');
    const cleanPhoneTarget = cleanPhone(clientPhone);

    // Matching apenas EXATO para evitar marcar o lead errado como "Ganho":
    // telefone normalizado igual OU nome normalizado igual.
    const normalizeName = (s: string) => (s ? s.toLowerCase().trim() : '');

    // Semelhança entre telefones: nº de dígitos coincidentes contados do final
    // (-1 = sem telefone para comparar)
    const phoneSimilarity = (a?: string | null, b?: string | null): number => {
      const da = cleanPhone(a || '');
      const db = cleanPhone(b || '');
      if (!da || !db) return -1;
      let same = 0;
      const maxLen = Math.min(da.length, db.length);
      while (same < maxLen && da[da.length - 1 - same] === db[db.length - 1 - same]) same++;
      return same;
    };

    // Entre múltiplos leads com o mesmo nome, prefere o de telefone mais próximo;
    // se permanecer ambíguo, descarta e registra warn (não marca lead errado)
    const resolveByName = (candidates: any[]): any | null => {
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];

      if (!cleanPhoneTarget) {
        logger.warn(`Webhook IXC: ${candidates.length} leads com o mesmo nome "${clientName}" e sem telefone no payload. Nenhum atualizado (ambiguidade).`);
        return null;
      }

      let best = candidates[0];
      for (const cand of candidates.slice(1)) {
        if (phoneSimilarity(cand.phone, clientPhone) > phoneSimilarity(best.phone, clientPhone)) {
          best = cand;
        }
      }

      if (phoneSimilarity(best.phone, clientPhone) <= 0) {
        logger.warn(`Webhook IXC: ${candidates.length} leads com o mesmo nome "${clientName}" e nenhum telefone próximo. Nenhum atualizado (ambiguidade).`);
        return null;
      }

      return best;
    };

    let matchedLead: any | null = null;

    // 1. Telefone normalizado exato
    if (cleanPhoneTarget && cleanPhoneTarget.length >= 8) {
      const phoneMatches = pendingLeads.filter(l => cleanPhone(l.phone) === cleanPhoneTarget);
      if (phoneMatches.length === 1) {
        matchedLead = phoneMatches[0];
      } else if (phoneMatches.length > 1) {
        logger.warn(`Webhook IXC: ${phoneMatches.length} leads com o mesmo telefone. Nenhum atualizado (ambiguidade).`);
      }
    }

    // 2. Nome normalizado exato
    if (!matchedLead && clientName) {
      matchedLead = resolveByName(pendingLeads.filter(l => normalizeName(l.name) === normalizeName(clientName)));
    }

    if (!matchedLead && clientName) {
      // Fallback: nome normalizado sem acentos/pontuação, ainda exigindo igualdade exata
      const strip = (s: string) => normalizeName(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const target = strip(clientName);
      if (target) {
        matchedLead = resolveByName(pendingLeads.filter(l => strip(l.name) === target));
      }
    }

    if (!matchedLead) {
      return NextResponse.json({ 
        success: true, 
        message: `Webhook recebido para "${clientName || clientPhone}", mas nenhum lead correspondente foi localizado no CRM.` 
      });
    }

    // 2. If contractValue is not in payload, query IXC API for contract value if domain and token are available
    if ((!contractValue || contractValue <= 0) && hasCredentials && clientId) {
      try {
        const contractRes = await fetchIxcWithTimeout(`https://${cleanDomain}/webservice/v1/cliente_contrato`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'ixcsoft': 'listar'
          },
          body: JSON.stringify({
            qtype: 'id_cliente',
            query: clientId,
            oper: '=',
            page: '1',
            rp: '10'
          })
        }, 10000);

        if (contractRes.ok) {
          const contractData = await contractRes.json();
          if (contractData.registros && contractData.registros.length > 0) {
            const activeContract = contractData.registros.find((c: any) => c.status === 'A') || contractData.registros[0];
            const val = parseBrValue(activeContract.valor || activeContract.valor_total || activeContract.mensalidade || '0');
            if (val > 0) {
              contractValue = val;
            }
          }
        }
      } catch (err: any) {
        console.warn('Failed to query contract value from IXC API:', err.message);
      }
    }

    // 3. Update Lead Status to 'Ganho' and update Value if available
    const updateFields: Record<string, any> = { status: 'Ganho' };
    if (contractValue > 0) {
      updateFields.value = contractValue;
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateFields)
      .eq('id', matchedLead.id);

    if (updateError) {
      console.error('Error updating lead via IXC Webhook:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // 4. Record entry in lead history
    const valueFormatted = contractValue > 0 
      ? ` | Valor do Contrato: R$ ${contractValue.toFixed(2)}`
      : '';

    const historyData = {
      lead_id: matchedLead.id,
      date: new Date().toLocaleString('pt-BR').substring(0, 16),
      action: 'Convertido via Webhook IXC Soft',
      note: `Contrato ativado no IXC Soft em tempo real (Cliente: ${clientName || matchedLead.name}${valueFormatted})`
    };

    const { error: historyError } = await supabase.from('lead_history').insert([historyData]);
    if (historyError) {
      console.warn(`Lead ${matchedLead.id} atualizado via webhook, mas o histórico não foi registrado:`, historyError.message);
    }

    return NextResponse.json({
      success: true,
      message: `Lead "${matchedLead.name}" atualizado para GANHO em tempo real com sucesso!`,
      leadId: matchedLead.id,
      contractValue: contractValue || matchedLead.value
    });

  } catch (error: any) {
    console.error('IXC Webhook Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Erro no Webhook' }, { status: 500 });
  }
}
