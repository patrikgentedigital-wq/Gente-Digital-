import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { PROGRAM_RULES } from '@/lib/rules';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'base_link')
      .maybeSingle();

    if (error) {
      console.warn('Erro ao consultar settings (base_link):', error.message);
      return NextResponse.json({ base_link: PROGRAM_RULES.linkBasePadrao });
    }

    return NextResponse.json({ base_link: data?.value || PROGRAM_RULES.linkBasePadrao });
  } catch (err: any) {
    return NextResponse.json({ base_link: PROGRAM_RULES.linkBasePadrao });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { value } = await req.json();
    if (!value || typeof value !== 'string') {
      return NextResponse.json({ error: 'Link base inválido.' }, { status: 400 });
    }

    const trimmed = value.trim();

    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'base_link', value: trimmed });

    if (error) {
      console.error('Erro ao salvar base_link via admin:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, base_link: trimmed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
