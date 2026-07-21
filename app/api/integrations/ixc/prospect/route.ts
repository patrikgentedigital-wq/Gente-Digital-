import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { name, phone, ref } = await req.json();

    if (!name || !phone) {
      return NextResponse.json({ success: false, error: 'Nome e telefone são obrigatórios' }, { status: 400 });
    }

    // Fetch credentials from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['ixc_domain', 'ixc_token']);

    const config: Record<string, string> = {
      ixc_domain: process.env.IXC_DOMAIN || '',
      ixc_token: process.env.IXC_TOKEN || ''
    };

    if (settingsData && settingsData.length > 0) {
      settingsData.forEach(row => {
        config[row.key] = row.value;
      });
    }

    const domain = config['ixc_domain'];
    const token = config['ixc_token'];

    if (!domain || !token) {
      return NextResponse.json({ success: false, error: 'IXC não configurado' }, { status: 400 });
    }

    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    const base64Token = Buffer.from(token).toString('base64');
    
    // Format current date for IXC (YYYY-MM-DD HH:MM:SS)
    const now = new Date();
    // Use local timezone offset to get correct string
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 19).replace('T', ' ');

    const payload = {
      nome: name,
      razao: name, // Necessário para salvar como Lead
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

    const ixcData = await ixcResponse.json();

    if (ixcData.type === 'error') {
      console.error('IXC Prospect Creation Error:', ixcData.message);
      return NextResponse.json({ success: false, error: ixcData.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Prospect criado no IXC', id: ixcData.id });

  } catch (error: any) {
    console.error('Create Prospect Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
