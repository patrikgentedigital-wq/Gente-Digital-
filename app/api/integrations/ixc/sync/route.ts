import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuthAny } from '@/lib/auth-server';

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthenticated = await verifyAuthAny(req);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // 1. Fetch credentials from settings
    const { data: settingsData, error: settingsError } = await supabase
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

    if (!domain || !token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Domínio ou Token inválido.' 
      }, { status: 400 });
    }

    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    const base64Token = Buffer.from(token).toString('base64');

    // 2. Fetch leads that are not installed/concluido
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .not('status', 'in', '("Ganho","Cancelado")');

    if (leadsError) {
      return NextResponse.json({ success: false, error: leadsError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Nenhum lead pendente de sincronização.', 
        updatedCount: 0,
        details: []
      });
    }

    let updatedCount = 0;
    const syncResults = [];

    // 3. Process each lead with timeout and detailed report
    for (const lead of leads) {
      try {
        const ixcResponse = await fetchWithTimeout(`https://${cleanDomain}/webservice/v1/cliente`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${base64Token}`,
            'Content-Type': 'application/json',
            'ixcsoft': 'listar'
          },
          body: JSON.stringify({
            qtype: 'razao',
            query: lead.name,
            oper: 'L',
            page: '1',
            rp: '5'
          })
        }, 10000);

        if (!ixcResponse.ok) {
          console.warn(`IXC request failed for lead ${lead.name}: Status ${ixcResponse.status}`);
          syncResults.push({ leadId: lead.id, name: lead.name, status: 'error', reason: `Status HTTP ${ixcResponse.status}` });
          continue;
        }

        const ixcData = await ixcResponse.json();

        if (ixcData.registros && ixcData.registros.length > 0) {
          let foundValidContract = false;
          let matchedClient = null;
          let activeContractId = null;
          
          const leadDate = lead.created_at ? new Date(lead.created_at) : new Date();
          leadDate.setDate(leadDate.getDate() - 30);
          
          let activeContractValue = 0;
          
          for (const client of ixcData.registros) {
            const contractRes = await fetchWithTimeout(`https://${cleanDomain}/webservice/v1/cliente_contrato`, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${base64Token}`,
                'Content-Type': 'application/json',
                'ixcsoft': 'listar'
              },
              body: JSON.stringify({
                qtype: 'id_cliente',
                query: client.id,
                oper: '=',
                page: '1',
                rp: '50'
              })
            }, 10000);
            
            if (!contractRes.ok) continue;
            
            const contractData = await contractRes.json();
            if (contractData.registros && contractData.registros.length > 0) {
              for (const contract of contractData.registros) {
                if (contract.status === 'A') {
                  const contractDate = new Date(contract.data);
                  if (contractDate >= leadDate) {
                    foundValidContract = true;
                    matchedClient = client;
                    activeContractId = contract.id;
                    const val = parseFloat(contract.valor || contract.valor_total || contract.mensalidade || '0');
                    if (val > 0) {
                      activeContractValue = val;
                    }
                    break;
                  }
                }
              }
            }
            if (foundValidContract) break;
          }
          
          if (!foundValidContract || !matchedClient) {
            syncResults.push({ leadId: lead.id, name: lead.name, status: 'no_contract', reason: 'Cliente encontrado sem contrato ativo recente' });
            continue;
          }
          
          const updateFields: Record<string, any> = { status: 'Ganho' };
          if (activeContractValue > 0) {
            updateFields.value = activeContractValue;
          }

          const { error: updateError } = await supabase
            .from('leads')
            .update(updateFields)
            .eq('id', lead.id);

          if (updateError) {
            console.error(`Error updating lead ${lead.id} to Ganho:`, updateError);
            syncResults.push({ leadId: lead.id, name: lead.name, status: 'error', reason: updateError.message });
            continue;
          }

          const valueText = activeContractValue > 0 ? ` | Valor: R$ ${activeContractValue.toFixed(2)}` : '';
          const historyData = {
            lead_id: lead.id,
            date: new Date().toLocaleString('pt-BR').substring(0, 16),
            action: 'Sincronizado com IXC Soft',
            note: `Contrato ativo localizado: ${matchedClient.razao} (Cliente ID: ${matchedClient.id}, Contrato: ${activeContractId}${valueText})`
          };

          await supabase.from('lead_history').insert([historyData]);

          updatedCount++;
          syncResults.push({
            leadId: lead.id,
            name: lead.name,
            status: 'success',
            matchedAs: matchedClient.razao,
            code: matchedClient.id,
            contract: activeContractId,
            value: activeContractValue
          });
        } else {
          syncResults.push({ leadId: lead.id, name: lead.name, status: 'not_found', reason: 'Cliente não localizado no cadastro IXC' });
        }
      } catch (err: any) {
        console.error(`Failed to sync lead ${lead.name} with IXC:`, err.message);
        syncResults.push({ leadId: lead.id, name: lead.name, status: 'error', reason: err.message || String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} lead(s) atualizados com sucesso para o status Ganho!`,
      updatedCount,
      details: syncResults
    });

  } catch (error: any) {
    console.error('IXC Sync Job Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
