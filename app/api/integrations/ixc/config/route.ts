import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

const DEFAULT_DOMAIN = 'ixc.gentedigital.com.br';
const DEFAULT_TOKEN = '85:b8f803056841572d25dbc6bbd6a99bb8f544da3d26d5c33c76d8cf1ec6afdbfb';

export async function GET() {
  try {
    // If the database configurations are loaded, fetch settings
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['ixc_domain', 'ixc_token']);

    if (error) {
      console.warn("Error reading settings table:", error.message);
      // Suppress table missing error to allow the user time to run the SQL command
      return NextResponse.json({ 
        success: true, 
        domain: DEFAULT_DOMAIN, 
        token: DEFAULT_TOKEN, 
        tableMissing: true 
      });
    }

    const config: Record<string, string> = {};
    data?.forEach(row => {
      config[row.key] = row.value;
    });

    return NextResponse.json({
      success: true,
      domain: config['ixc_domain'] || DEFAULT_DOMAIN,
      token: config['ixc_token'] || DEFAULT_TOKEN,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { domain, token } = await req.json();

    if (domain === undefined || token === undefined) {
      return NextResponse.json({ error: 'Domínio e token são obrigatórios.' }, { status: 400 });
    }

    const { error: err1 } = await supabase
      .from('settings')
      .upsert({ key: 'ixc_domain', value: domain });

    if (err1) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tabela settings não encontrada. Certifique-se de executar o comando SQL no Supabase.' 
      }, { status: 400 });
    }

    const { error: err2 } = await supabase
      .from('settings')
      .upsert({ key: 'ixc_token', value: token });

    if (err2) throw err2;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
