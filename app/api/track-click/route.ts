import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-server';
import { checkRateLimit } from '@/lib/ratelimit';
import { cacheClient } from '@/lib/cache-client';
import { z } from 'zod';

const TrackClickSchema = z.object({
  ref: z.string().trim().min(1).max(50),
});

const REF_PATTERN = /^[A-Za-z0-9 _\-.\u00C0-\u024F]+$/;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rateLimit = await checkRateLimit(`track_click_${ip}`, 10, 60);
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: 'Muitas requisições.' }, { status: 429 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = TrackClickSchema.safeParse(rawBody);

    if (!parsed.success || !REF_PATTERN.test(parsed.data.ref)) {
      return NextResponse.json({ success: false, error: 'ref inválido' }, { status: 400 });
    }

    const { ref } = parsed.data;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
      return NextResponse.json({ success: true, tracked: false });
    }

    const { error } = await supabase
      .from('link_clicks')
      .insert({ ref, created_at: new Date().toISOString() });

    if (error) {
      console.error('Erro ao registrar clique:', error.message);
      return NextResponse.json({ success: false, error: 'Erro ao registrar clique.' }, { status: 500 });
    }

    // Invalida cache de contagem de cliques
    await cacheClient.delete('link_clicks_summary');

    return NextResponse.json({ success: true, tracked: true });
  } catch (err: any) {
    console.error('Exceção ao registrar clique:', err);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
      return NextResponse.json({ success: true, clicks: [] });
    }

    const cachedClicks = await cacheClient.get<{ ref: string; count: number }[]>('link_clicks_summary');
    if (cachedClicks) {
      return NextResponse.json({ success: true, clicks: cachedClicks, cached: true });
    }

    const { data, error } = await supabase
      .from('link_clicks')
      .select('ref');

    if (error) {
      console.error('Erro ao buscar cliques:', error.message);
      return NextResponse.json({ success: false, error: 'Erro ao buscar cliques.' }, { status: 500 });
    }

    const clickCounts: Record<string, number> = {};
    (data || []).forEach(row => {
      if (!row.ref) return;
      clickCounts[row.ref] = (clickCounts[row.ref] || 0) + 1;
    });

    const clicks = Object.entries(clickCounts).map(([ref, count]) => ({ ref, count }));
    
    // Cache por 30 segundos
    await cacheClient.set('link_clicks_summary', clicks, 30);

    return NextResponse.json({ success: true, clicks });
  } catch (err: any) {
    console.error('Exceção ao buscar cliques:', err);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}

