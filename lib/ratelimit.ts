import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (url && token && !url.includes('placeholder')) 
  ? new Redis({ url, token }) 
  : null;

// Armazenamento em memória caso o Redis não esteja disponível
const memoryStore = new Map<string, number[]>();
const MEMORY_STORE_MAX_KEYS = 5000;

// Remove chaves cujas janelas já expiraram para evitar crescimento ilimitado
function sweepExpiredKeys(windowMs: number) {
  const now = Date.now();
  for (const [key, timestamps] of memoryStore) {
    const alive = timestamps.filter(ts => now - ts < windowMs);
    if (alive.length === 0) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, alive);
    }
  }
}

/**
 * Utilitário universal de Rate Limit (Redis com fallback em memória)
 */
export async function checkRateLimit(
  key: string, 
  limit = 5, 
  windowSeconds = 60
): Promise<{ success: boolean; remaining?: number }> {
  if (redis) {
    try {
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      });
      const res = await ratelimit.limit(key);
      return { success: res.success, remaining: res.remaining };
    } catch (e) {
      console.warn('Falha ao verificar rate limit no Redis, usando fallback em memória:', e);
    }
  }

  // Fallback em memória
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const timestamps = (memoryStore.get(key) || []).filter(ts => now - ts < windowMs);

  if (timestamps.length >= limit) {
    memoryStore.set(key, timestamps);
    if (memoryStore.size > MEMORY_STORE_MAX_KEYS) {
      sweepExpiredKeys(windowMs);
    }
    return { success: false, remaining: 0 };
  }

  timestamps.push(now);
  memoryStore.set(key, timestamps);
  if (memoryStore.size > MEMORY_STORE_MAX_KEYS) {
    sweepExpiredKeys(windowMs);
  }
  return { success: true, remaining: limit - timestamps.length };
}
