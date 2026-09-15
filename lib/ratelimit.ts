import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (url && token && !url.includes('placeholder')) 
  ? new Redis({ url, token }) 
  : null;

// Singleton de Ratelimit em nível de módulo (lazy init) — evita criar uma
// instância nova (e reconfigurar o limiter) em cada chamada de checkRateLimit.
let ratelimitInstance: Ratelimit | null = null;

function getRatelimitInstance(limit: number, windowSeconds: number): Ratelimit {
  if (!ratelimitInstance) {
    ratelimitInstance = new Ratelimit({
      redis: redis as Redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    });
  }
  return ratelimitInstance;
}

// Armazenamento em memória caso o Redis não esteja disponível.
// Cada chave guarda suas próprias timestamps e a janela (windowMs) com que foi criada,
// para o sweep usar o windowMs da própria entrada e filtrar por prefixo do endpoint.
const memoryStore = new Map<string, { timestamps: number[]; windowMs: number }>();
const MEMORY_STORE_MAX_KEYS = 5000;

// Remove chaves cujas janelas (de cada entrada) já expiraram. O prefixo opcional
// restringe o sweep às chaves do próprio endpoint que está sofrendo o burst.
function sweepExpiredKeys(prefix?: string) {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (prefix && !key.startsWith(prefix)) continue;
    const alive = entry.timestamps.filter(ts => now - ts < entry.windowMs);
    if (alive.length === 0) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, { timestamps: alive, windowMs: entry.windowMs });
    }
  }
}

// Extrai o prefixo de endpoint da chave (ex: "track_click_1.2.3.4" -> "track_click")
function getKeyPrefix(key: string): string {
  const idx = key.lastIndexOf('_');
  return idx > 0 ? key.slice(0, idx) : key;
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
      const ratelimit = getRatelimitInstance(limit, windowSeconds);
      const res = await ratelimit.limit(key);
      return { success: res.success, remaining: res.remaining };
    } catch (e) {
      console.warn('Falha ao verificar rate limit no Redis, usando fallback em memória:', e);
    }
  }

  // Fallback em memória
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const stored = memoryStore.get(key);
  const timestamps = (stored?.timestamps || []).filter(ts => now - ts < windowMs);

  if (timestamps.length >= limit) {
    memoryStore.set(key, { timestamps, windowMs });
    if (memoryStore.size > MEMORY_STORE_MAX_KEYS) {
      sweepExpiredKeys(getKeyPrefix(key));
    }
    return { success: false, remaining: 0 };
  }

  timestamps.push(now);
  memoryStore.set(key, { timestamps, windowMs });
  if (memoryStore.size > MEMORY_STORE_MAX_KEYS) {
    sweepExpiredKeys(getKeyPrefix(key));
  }
  return { success: true, remaining: limit - timestamps.length };
}
