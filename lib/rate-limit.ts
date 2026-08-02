import 'server-only';

import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

type PublicLimit =
  | 'track-click'
  | 'referral-submit'
  | 'referral-status'
  | 'web-vitals'
  | 'ai'
  | 'webhook-ms-forms'
  | 'webhook-ixc'
  | 'ixc-sync'
  | 'ixc-test'
  | 'ixc-prospect';

const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

const limiters: Record<PublicLimit, Ratelimit | null> = {
  'track-click': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m'), prefix: 'rl:track-click' })
    : null,
  'referral-submit': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '10 m'), prefix: 'rl:referral-submit' })
    : null,
  'referral-status': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m'), prefix: 'rl:referral-status' })
    : null,
  'web-vitals': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m'), prefix: 'rl:web-vitals' })
    : null,
  ai: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, '1 m'), prefix: 'rl:ai' })
    : null,
  'webhook-ms-forms': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'rl:webhook-ms-forms' })
    : null,
  'webhook-ixc': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'rl:webhook-ixc' })
    : null,
  'ixc-sync': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '10 m'), prefix: 'rl:ixc-sync' })
    : null,
  'ixc-test': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:ixc-test' })
    : null,
  'ixc-prospect': redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '10 m'), prefix: 'rl:ixc-prospect' })
    : null,
};

const fallbackLimits: Record<PublicLimit, { limit: number; windowSeconds: number }> = {
  'track-click': { limit: 30, windowSeconds: 60 },
  'referral-submit': { limit: 5, windowSeconds: 600 },
  'referral-status': { limit: 30, windowSeconds: 60 },
  'web-vitals': { limit: 30, windowSeconds: 60 },
  ai: { limit: 15, windowSeconds: 60 },
  'webhook-ms-forms': { limit: 60, windowSeconds: 60 },
  'webhook-ixc': { limit: 60, windowSeconds: 60 },
  'ixc-sync': { limit: 3, windowSeconds: 600 },
  'ixc-test': { limit: 10, windowSeconds: 60 },
  'ixc-prospect': { limit: 30, windowSeconds: 600 },
};

export function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp && realIp.length <= 100) return realIp;

  const forwarded = request.headers.get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  return forwarded && forwarded.length <= 100 ? forwarded : 'unknown';
}

export async function checkPublicRateLimit(
  type: PublicLimit,
  request: NextRequest,
  identity?: string,
): Promise<{ success: boolean; retryAfterSeconds?: number; unavailable?: boolean }> {
  const limiter = limiters[type];
  const subject = identity || getClientIp(request);

  if (limiter) {
    const result = await limiter.limit(subject);
    if (result.success) return { success: true };
    return {
      success: false,
      retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return process.env.NODE_ENV === 'production' ? { success: false, unavailable: true } : { success: true };
  }

  const config = fallbackLimits[type];
  const key = createHash('sha256').update(`${type}:${subject}`).digest('hex');
  const { data, error } = await supabaseAdmin.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: config.limit,
    p_window_seconds: config.windowSeconds,
  });

  if (error || !Array.isArray(data) || !data[0]) {
    console.error('Falha no rate limit do banco:', error?.message || 'resposta inválida');
    return { success: false, unavailable: true };
  }

  return {
    success: Boolean(data[0].allowed),
    retryAfterSeconds: Math.max(1, Number(data[0].retry_after_seconds) || config.windowSeconds),
  };
}
