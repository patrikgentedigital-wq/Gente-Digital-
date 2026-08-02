import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPublicRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';

const WebVitalSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.enum(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']),
  value: z.number().finite().nonnegative(),
  delta: z.number().finite(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  navigationType: z.string().trim().max(40).optional(),
  path: z.string().trim().startsWith('/').max(200),
});

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder'),
  );
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicRateLimit('web-vitals', request);
  if (!rateLimit.success) return NextResponse.json({ success: false }, { status: 202 });
  if (!configured()) return NextResponse.json({ success: true, tracked: false });

  const rawBody = await request.json().catch(() => ({}));
  const parsed = WebVitalSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ success: false }, { status: 400 });

  const { error } = await supabaseAdmin.from('web_vitals').upsert({
    metric_id: parsed.data.id,
    metric_name: parsed.data.name,
    value: parsed.data.value,
    delta: parsed.data.delta,
    rating: parsed.data.rating || null,
    navigation_type: parsed.data.navigationType || null,
    path: parsed.data.path,
  }, { onConflict: 'metric_id', ignoreDuplicates: true });

  if (error) {
    console.error('Erro ao registrar Web Vital:', error.message);
    return NextResponse.json({ success: false }, { status: 500 });
  }

  return NextResponse.json({ success: true, tracked: true }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
