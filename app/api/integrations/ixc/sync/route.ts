import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
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
        updatedCount: 0 
      });
    }

    let updatedCount = 0;
    const syncResults = [];

    // 3. Process each lead (limit parallel calls to prevent rate limiting/timeouts)
    for (const lead of leads) {
      try {
        // Query client by name in IXC
        const ixcResponse = await fetch(`https://${cleanDomain}/webservice/v1/cliente`, {
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
        });

        if (!ixcResponse.ok) {
          console.warn(`IXC request failed for lead ${lead.name}: Status ${ixcResponse.status}`);
          continue;
        }

        const ixcData = await ixcResponse.json();

        if (ixcData.registros && ixcData.registros.length > 0) {
          let foundValidContract = false;
          let matchedClient = null;
          let activeContractId = null;
          
          // Calculate a threshold date (e.g. 30 days before lead creation)
          const leadDate = lead.created_at ? new Date(lead.created_at) : new Date();
          leadDate.setDate(leadDate.getDate() - 30);
          
          for (const client of ixcData.registros) {
            // Check contracts for this client
            const contractRes = await fetch(`https://${cleanDomain}/webservice/v1/cliente_contrato`, {
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
            });
            
            if (!contractRes.ok) continue;
            
            const contractData = await contractRes.json();
            if (contractData.registros && contractData.registros.length > 0) {
              // Look for a recent active contract
              for (const contract of contractData.registros) {
                if (contract.status === 'A') {
                  const contractDate = new Date(contract.data);
                  if (contractDate >= leadDate) {
                    foundValidContract = true;
                    matchedClient = client;
                    activeContractId = contract.id;
                    break;
                  }
                }
              }
            }
            if (foundValidContract) break;
          }
          
          if (!foundValidContract || !matchedClient) {
            // No recent active contract found for this lead
            continue;
          }
          
          // Update lead status in Supabase
          const { error: updateError } = await supabase
            .from('leads')
            .update({ status: 'Ganho' })
            .eq('id', lead.id);

          if (updateError) {
            console.error(`Error updating lead ${lead.id} to Ganho:`, updateError);
            continue;
          }

          // Insert into lead history
          const historyData = {
            lead_id: lead.id,
            date: new Date().toLocaleString('pt-BR').substring(0, 16),
            action: 'Sincronizado com IXC Soft',
            note: `Contrato ativo localizado: ${matchedClient.razao} (Cliente ID: ${matchedClient.id}, Contrato: ${activeContractId})`
          };

          await supabase.from('lead_history').insert([historyData]);

          updatedCount++;
          syncResults.push({
            leadId: lead.id,
            name: lead.name,
            matchedAs: matchedClient.razao,
            code: matchedClient.id,
            contract: activeContractId
          });
        }
      } catch (err: any) {
        console.error(`Failed to sync lead ${lead.name} with IXC:`, err.message);
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
