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

// Conta cliques do mês atual e do mês anterior para tendência real no Dashboard
async function getMonthClickCounts(): Promise<{ currentMonthClicks: number; previousMonthClicks: number }> {
  const fallback = { currentMonthClicks: 0, previousMonthClicks: 0 };
  const rawSbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!rawSbUrl || rawSbUrl.includes('placeholder')) {
    return fallback;
  }

  const now = new Date();
  const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const countForRange = async (gte: string, lt?: string): Promise<number> => {
    try {
      let query = supabase
        .from('link_clicks')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', gte);
      if (lt) {
        query = query.lt('created_at', lt);
      }
      const { count, error } = await query;
      if (error) {
        console.warn('Erro ao contar cliques por período:', error.message);
        return 0;
      }
      return count ?? 0;
    } catch (err: any) {
      console.warn('Exceção ao contar cliques por período:', err?.message || err);
      return 0;
    }
  };

  try {
    const [current, previous] = await Promise.all([
      countForRange(startCurrent),
      countForRange(startPrevious, startCurrent),
    ]);
    return { currentMonthClicks: current, previousMonthClicks: previous };
  } catch (err) {
    console.warn('Falha ao obter contagens mensais de cliques:', err);
    return fallback;
  }
}

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

    const rawSbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (!rawSbUrl || rawSbUrl.includes('placeholder')) {
      return NextResponse.json({ success: true, tracked: false });
    }

    // Valida que a ref corresponde a um colaborador existente para não inflar métricas
    // com refs arbitrárias enviadas por terceiros
    const { data: colabByRef, error: colabRefError } = await supabase
      .from('colaboradores')
      .select('id')
      .eq('id', ref)
      .limit(1);

    let refExists = !!colabByRef && colabByRef.length > 0;

    if (colabRefError) {
      console.warn('Erro ao validar ref de colaborador no track-click:', colabRefError.message);
    } else if (!refExists) {
      // Fallback: alguns fluxos (ex.: MS Forms) enviam o nome do colaborador como ref
      const { data: colabByName, error: colabNameError } = await supabase
        .from('colaboradores')
        .select('id')
        .eq('name', ref)
        .limit(1);

      if (colabNameError) {
        console.warn('Erro ao validar ref por nome no track-click:', colabNameError.message);
      } else {
        refExists = !!colabByName && colabByName.length > 0;
      }
    }

    if (!refExists) {
      return NextResponse.json({ success: false, reason: 'ref_invalida' }, { status: 200 });
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

    const rawSbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (!rawSbUrl || rawSbUrl.includes('placeholder')) {
      return NextResponse.json({ success: true, clicks: [] });
    }

    const cached = await cacheClient.get<{ clicks: { ref: string; count: number }[]; clicksDaily: Record<string, number> }>('link_clicks_summary');
    if (cached) {
      const monthCounts = await getMonthClickCounts();
      return NextResponse.json({ success: true, clicks: cached.clicks, clicksDaily: cached.clicksDaily, cached: true, ...monthCounts });
    }

    // Limita a contagem a uma janela temporal recente (últimos 90 dias) e teto seguro
    // para prevenir consumo excessivo de memória em bases de cliques volumosas
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const MAX_CLICKS = 50000;
    const { data, error } = await supabase
      .from('link_clicks')
      .select('ref, created_at')
      .gte('created_at', ninetyDaysAgo)
      .limit(MAX_CLICKS);

    if (error) {
      console.error('Erro ao buscar cliques:', error.message);
      return NextResponse.json({ success: false, error: 'Erro ao buscar cliques.' }, { status: 500 });
    }

    if ((data || []).length >= MAX_CLICKS) {
      console.warn(`Limite de ${MAX_CLICKS} cliques atingido na consulta de resumo; a contagem pode estar subestimada.`);
    }

    const clickCounts: Record<string, number> = {};
    // Agregação diária (data local do clique) para permitir filtros de período no frontend
    const clicksDaily: Record<string, number> = {};
    (data || []).forEach(row => {
      if (!row.ref) return;
      clickCounts[row.ref] = (clickCounts[row.ref] || 0) + 1;
      if (row.created_at) {
        const d = new Date(row.created_at);
        const pad = (n: number) => String(n).padStart(2, '0');
        const localDay = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        clicksDaily[localDay] = (clicksDaily[localDay] || 0) + 1;
      }
    });

    const clicks = Object.entries(clickCounts).map(([ref, count]) => ({ ref, count }));

    // Cache por 30 segundos
    await cacheClient.set('link_clicks_summary', { clicks, clicksDaily }, 30);

    const monthCounts = await getMonthClickCounts();

    return NextResponse.json({ success: true, clicks, clicksDaily, ...monthCounts });
  } catch (err: any) {
    console.error('Exceção ao buscar cliques:', err);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}

