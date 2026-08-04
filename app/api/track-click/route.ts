import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPublicRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeReferralCode } from '@/lib/referrals';
import { verifyAuth } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const TrackClickSchema = z.object({
  ref: z.string().trim().min(1).max(50),
  visitorId: z.string().uuid().optional(),
});

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder'),
  );
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicRateLimit('track-click', request);
  if (!rateLimit.success) return noStoreJson({ success: true, tracked: false }, 202);

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = TrackClickSchema.safeParse(body);
    const ref = parsed.success ? normalizeReferralCode(parsed.data.ref) : '';
    if (!parsed.success || !ref) return noStoreJson({ success: false, error: 'ref inválido' }, 400);

    if (!isConfigured()) return noStoreJson({ success: true, tracked: false });

    const day = new Date().toISOString().slice(0, 10);
    const visitor = parsed.data.visitorId || `${getClientIp(request)}:${request.headers.get('user-agent') || 'unknown'}`;
    const dedupeKey = createHash('sha256')
      .update(`${ref}|${visitor}|${day}`)
      .digest('hex');

    const { error } = await supabaseAdmin
      .from('link_clicks')
      .upsert({ ref, dedupe_key: dedupeKey }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

    if (error) {
      console.error('Erro ao registrar clique:', error.message);
      return noStoreJson({ success: false, error: 'Erro ao registrar clique.' }, 500);
    }

    return noStoreJson({ success: true, tracked: true });
  } catch (error) {
    console.error('Exceção ao registrar clique:', error);
    return noStoreJson({ success: false, error: 'Erro interno do servidor.' }, 500);
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) return noStoreJson({ success: false, error: 'Não autorizado.' }, 401);
  if (!isConfigured()) return noStoreJson({ success: true, clicks: [] });

  try {
    const { data, error } = await supabaseAdmin.rpc('get_link_click_counts');
    if (error) {
      console.error('Erro ao buscar cliques:', error.message);
      return noStoreJson({ success: false, error: 'Erro ao buscar cliques.' }, 500);
    }

    const clicks = (data || []).map((row: { ref: string; click_count: number | string }) => ({
      ref: row.ref,
      count: Number(row.click_count),
    }));
    return noStoreJson({ success: true, clicks });
  } catch (error) {
    console.error('Exceção ao buscar cliques:', error);
    return noStoreJson({ success: false, error: 'Erro interno do servidor.' }, 500);
  }
}
