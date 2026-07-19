import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { domain, token } = await req.json();

    if (!domain || !token) {
      return NextResponse.json({ error: 'Domínio e token são obrigatórios.' }, { status: 400 });
    }

    // Normalize domain
    let cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    
    // Test URL
    const url = `https://${cleanDomain}/webservice/v1/cliente`;

    // Base64 encode the token
    const base64Token = Buffer.from(token).toString('base64');

    console.log(`Testing IXC integration. URL: ${url}`);

    // Request to IXC Webservice API with a 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${base64Token}`,
          'Content-Type': 'application/json',
          'ixcsoft': 'listar'
        },
        body: JSON.stringify({
          qtype: 'cliente.id',
          query: '0',
          oper: '>',
          page: '1',
          rp: '1'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`IXC test connection returned status ${response.status}: ${errorText}`);
        
        if (response.status === 401 || response.status === 403) {
          return NextResponse.json({ 
            success: false, 
            error: 'Credenciais inválidas (Token inválido ou não autorizado no IXC).' 
          });
        }
        
        return NextResponse.json({ 
          success: false, 
          error: `Servidor IXC respondeu com código de erro ${response.status}.` 
        });
      }

      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: 'Conectado ao IXC Soft com sucesso!',
        totalClientes: data.total || 0
      });

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({
          success: false,
          error: 'Tempo limite esgotado ao conectar ao IXC Soft (Timeout de 10s). Verifique se o IP deste servidor está liberado no firewall do IXC.'
        });
      }
      throw fetchError;
    }

  } catch (error: any) {
    console.error('IXC Test Connection Error:', error);
    return NextResponse.json({
      success: false,
      error: `Não foi possível conectar ao servidor IXC: ${error.message || 'Verifique se o domínio está correto e se o servidor está online.'}`
    });
  }
}
