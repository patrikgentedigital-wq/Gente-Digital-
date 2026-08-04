import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStaffUser, verifyAuth } from '@/lib/auth-server';
import { isSameOriginRequest } from '@/lib/request-security';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

const BaseLinkSchema = z.string().trim().min(1).max(500).url();

function isSafeBaseLink(value: string) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) return false;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false;
    return Boolean(url.hostname) && !url.hostname.includes('localhost') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname);
  } catch {
    return false;
  }
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) return noStoreJson({ success: false, error: 'Não autorizado.' }, 401);
  if (!isSupabaseAdminConfigured()) return noStoreJson({ success: false, error: 'Serviço indisponível.' }, 503);

  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'base_link')
    .maybeSingle();
  if (error) {
    console.error('Falha ao consultar o link base:', error.message);
    return noStoreJson({ success: false, error: 'Não foi possível carregar o link base.' }, 500);
  }
  return noStoreJson({ success: true, value: data?.value || null });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return noStoreJson({ success: false, error: 'Origem não permitida.' }, 403);
  if (!(await getStaffUser(request))) return noStoreJson({ success: false, error: 'Não autorizado.' }, 401);
  if (!isSupabaseAdminConfigured()) return noStoreJson({ success: false, error: 'Serviço indisponível.' }, 503);

  const body = await request.json().catch(() => ({}));
  const parsed = z.object({ value: BaseLinkSchema }).safeParse(body);
  if (!parsed.success || !isSafeBaseLink(parsed.data.value)) {
    return noStoreJson({ success: false, error: 'Informe uma URL HTTPS válida.' }, 400);
  }

  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key: 'base_link', value: parsed.data.value }, { onConflict: 'key' });
  if (error) {
    console.error('Falha ao salvar o link base:', error.message);
    return noStoreJson({ success: false, error: 'Não foi possível salvar o link base.' }, 500);
  }
  return noStoreJson({ success: true, value: parsed.data.value });
}
