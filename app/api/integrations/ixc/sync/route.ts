import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    // 1. Fetch credentials from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['ixc_domain', 'ixc_token']);

    if (settingsError || !settingsData || settingsData.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Credenciais do IXC Soft não encontradas no banco de dados. Configure a integração primeiro.' 
      }, { status: 400 });
    }

    const config: Record<string, string> = {};
    settingsData.forEach(row => {
      config[row.key] = row.value;
    });

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
      .not('status', 'in', '("Instalado","Cancelado")');

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
          },
          body: JSON.stringify({
            qtype: 'cliente.razao',
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
          // Found a match in IXC! Let's choose the best match
          const matchedClient = ixcData.registros[0];
          
          // Update lead status in Supabase
          const { error: updateError } = await supabase
            .from('leads')
            .update({ status: 'Instalado' })
            .eq('id', lead.id);

          if (updateError) {
            console.error(`Error updating lead ${lead.id} to Instalado:`, updateError);
            continue;
          }

          // Insert into lead history
          const historyData = {
            lead_id: lead.id,
            date: new Date().toLocaleString('pt-BR').substring(0, 16),
            action: 'Sincronizado com IXC Soft',
            note: `Cliente ativo localizado no ERP: ${matchedClient.razao} (Código: ${matchedClient.id})`
          };

          await supabase.from('lead_history').insert([historyData]);

          updatedCount++;
          syncResults.push({
            leadId: lead.id,
            name: lead.name,
            matchedAs: matchedClient.razao,
            code: matchedClient.id
          });
        }
      } catch (err: any) {
        console.error(`Failed to sync lead ${lead.name} with IXC:`, err.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} lead(s) atualizados com sucesso para o status Instalado!`,
      updatedCount,
      details: syncResults
    });

  } catch (error: any) {
    console.error('IXC Sync Job Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
