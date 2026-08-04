import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/auth-server';
import { isSameOriginRequest } from '@/lib/request-security';
import { checkPublicRateLimit } from '@/lib/rate-limit';
import { fetchIxc, getIxcConfig } from '@/lib/ixc';
import { supabaseAdmin } from '@/lib/supabase-admin';

function parseMoney(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000_000 ? parsed : 0;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem nao permitida.' }, { status: 403 });

    const rateLimit = await checkPublicRateLimit('ixc-sync', request, `user:${admin.id}`);
    if (rateLimit.unavailable) return NextResponse.json({ error: 'Rate limit indisponivel.' }, { status: 503 });
    if (!rateLimit.success) return NextResponse.json({ error: 'Sincronizacao temporariamente limitada.' }, { status: 429 });

    const config = await getIxcConfig();
    if (!config) return NextResponse.json({ success: false, error: 'IXC nao configurado.' }, { status: 503 });

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, value, status, created_at')
      .not('status', 'in', '("Ganho","Cancelado")')
      .order('created_at', { ascending: true })
      .limit(500);
    if (leadsError) throw leadsError;

    let updatedCount = 0;
    const syncResults: Array<{ leadId: number; contract: string; value: number }> = [];

    for (const lead of leads || []) {
      try {
        const clientResponse = await fetchIxc(`${config.host}/webservice/v1/cliente`, config.token, {
          qtype: 'razao', query: lead.name, oper: 'L', page: '1', rp: '5',
        });
        if (!clientResponse.ok) continue;
        const clientData = await clientResponse.json().catch(() => ({}));

        const leadDate = lead.created_at ? new Date(lead.created_at) : new Date();
        leadDate.setDate(leadDate.getDate() - 30);
        let matchedClient: any = null;
        let activeContractId: string | null = null;
        let activeContractValue = 0;

        for (const client of Array.isArray(clientData.registros) ? clientData.registros : []) {
          const contractResponse = await fetchIxc(`${config.host}/webservice/v1/cliente_contrato`, config.token, {
            qtype: 'id_cliente', query: client.id, oper: '=', page: '1', rp: '50',
          });
          if (!contractResponse.ok) continue;
          const contractData = await contractResponse.json().catch(() => ({}));
          const contract = (Array.isArray(contractData.registros) ? contractData.registros : [])
            .find((item: any) => item.status === 'A' && new Date(item.data) >= leadDate);
          if (!contract) continue;

          matchedClient = client;
          activeContractId = String(contract.id || '');
          activeContractValue = parseMoney(contract.valor || contract.valor_total || contract.mensalidade);
          break;
        }

        if (!matchedClient || !activeContractId) continue;

        const updateFields: Record<string, unknown> = { status: 'Ganho' };
        if (activeContractValue > 0) updateFields.value = activeContractValue;
        const { error: updateError } = await supabaseAdmin.from('leads').update(updateFields).eq('id', lead.id);
        if (updateError) continue;

        await supabaseAdmin.from('lead_history').insert({
          lead_id: lead.id,
          date: new Date().toLocaleString('pt-BR').substring(0, 16),
          action: 'Sincronizado com IXC Soft',
          note: `Contrato ativo localizado no IXC (Contrato: ${activeContractId}${activeContractValue ? ` | Valor: R$ ${activeContractValue.toFixed(2)}` : ''})`,
        });

        updatedCount += 1;
        if (syncResults.length < 100) syncResults.push({ leadId: lead.id, contract: activeContractId, value: activeContractValue });
      } catch (error) {
        console.warn(`IXC sync failed for lead ${lead.id}:`, error instanceof Error ? error.message : 'unknown error');
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} lead(s) atualizados.`,
      updatedCount,
      details: syncResults,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('IXC sync error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Falha na sincronizacao com o IXC.' }, { status: 500 });
  }
}
