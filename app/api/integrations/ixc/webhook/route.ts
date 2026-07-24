import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { timingSafeEqual } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    // 1. Validação de Segurança (Token Secreto Obrigatório)
    const secret = req.nextUrl.searchParams.get('secret');
    const expectedSecret = process.env.IXC_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
    
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
    console.log('IXC Webhook recebido');

    // Support both direct IXC trigger payloads and standard webhook formats
    const payload = rawBody.data || rawBody.registro || rawBody;
    
    const clientName = payload.razao || payload.nome || payload.cliente_nome || payload.client_name || '';
    const clientPhone = payload.telefone_celular || payload.telefone || payload.cellphone || payload.phone || '';
    const clientId = payload.id_cliente || payload.cliente_id || payload.client_id || '';
    const contractStatus = payload.status || payload.contrato_status || 'A';
    
    // Parse contract value if provided in webhook payload
    let contractValue = parseFloat(payload.valor || payload.valor_total || payload.mensalidade || payload.valor_contrato || '0');

    if (!clientName && !clientPhone && !clientId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Payload de webhook recebido, porém sem identificação de cliente/lead.' 
      }, { status: 400 });
    }

    // Check IXC credentials to fetch contract value if missing in payload
    const { data: settingsData } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['ixc_domain', 'ixc_token']);

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

    // 1. Find matching lead in Supabase (not already marked as Ganho)
    const { data: pendingLeads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .not('status', 'eq', 'Ganho');

    if (leadsError) {
      console.error('Error querying leads for IXC webhook:', leadsError);
      return NextResponse.json({ success: false, error: leadsError.message }, { status: 500 });
    }

    if (!pendingLeads || pendingLeads.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook processado, mas nenhum lead pendente foi encontrado no sistema.' 
      });
    }

    const cleanStr = (s: string) => s ? s.toLowerCase().replace(/\D/g, '') : '';
    const cleanPhoneTarget = cleanStr(clientPhone);

    // Try finding lead by phone or name
    let matchedLead = pendingLeads.find(l => {
      if (cleanPhoneTarget && cleanPhoneTarget.length >= 8 && cleanStr(l.phone).includes(cleanPhoneTarget)) {
        return true;
      }
      if (clientName && l.name && l.name.toLowerCase().trim() === clientName.toLowerCase().trim()) {
        return true;
      }
      return false;
    });

    if (!matchedLead && clientName) {
      // Fuzzy name match if exact match wasn't found
      matchedLead = pendingLeads.find(l => 
        l.name.toLowerCase().includes(clientName.toLowerCase()) || 
        clientName.toLowerCase().includes(l.name.toLowerCase())
      );
    }

    if (!matchedLead) {
      return NextResponse.json({ 
        success: true, 
        message: `Webhook recebido para "${clientName || clientPhone}", mas nenhum lead correspondente foi localizado no CRM.` 
      });
    }

    // 2. If contractValue is not in payload, query IXC API for contract value if domain and token are available
    if ((!contractValue || contractValue <= 0) && domain && token && clientId) {
      try {
        const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
        const base64Token = Buffer.from(token).toString('base64');
        
        const contractRes = await fetch(`https://${cleanDomain}/webservice/v1/cliente_contrato`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${base64Token}`,
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
        });

        if (contractRes.ok) {
          const contractData = await contractRes.json();
          if (contractData.registros && contractData.registros.length > 0) {
            const activeContract = contractData.registros.find((c: any) => c.status === 'A') || contractData.registros[0];
            const val = parseFloat(activeContract.valor || activeContract.valor_total || activeContract.mensalidade || '0');
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

    await supabase.from('lead_history').insert([historyData]);

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
