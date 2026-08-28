/**
 * Wrapper de Cache com Tracking de Hit e Miss (DevOps Regra 6)
 * 
 * Regra 6: Todo cache possui Hit/Miss Tracking com medição de tempo e logging.
 */

import { logger } from './logger';
import { metricsRegistry } from './metrics';

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

class TrackedCacheClient {
  private store = new Map<string, CacheEntry<any>>();
  private sweepThreshold = 100;

  // Remove entradas expiradas quando o store cresce demais
  private sweepExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Obtém um valor do cache rastreando o evento de HIT ou MISS
   */
  public async get<T>(key: string, requestId?: string): Promise<T | null> {
    const startTime = performance.now();
    const entry = this.store.get(key);
    const now = Date.now();

    const durationMs = Number((performance.now() - startTime).toFixed(2));

    if (entry && (entry.expiresAt === null || entry.expiresAt > now)) {
      metricsRegistry.recordCacheHit();
      logger.info(`[CACHE HIT] Chave '${key}' encontrada (${durationMs}ms)`, {
        event: 'CACHE_HIT',
        key,
        durationMs,
      }, requestId);
      return entry.value as T;
    }

    // Se tiver expirado, limpa da memória
    if (entry) {
      this.store.delete(key);
    }

    metricsRegistry.recordCacheMiss();
    logger.info(`[CACHE MISS] Chave '${key}' não encontrada ou expirada (${durationMs}ms)`, {
      event: 'CACHE_MISS',
      key,
      durationMs,
    }, requestId);

    return null;
  }

  /**
   * Armazena um valor no cache com TTL opcional em segundos
   */
  public async set<T>(key: string, value: T, ttlSeconds?: number, requestId?: string): Promise<void> {
    const startTime = performance.now();
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;

    this.store.set(key, { value, expiresAt });
    if (this.store.size > this.sweepThreshold) {
      this.sweepExpired();
    }
    const durationMs = Number((performance.now() - startTime).toFixed(2));

    logger.info(`[CACHE SET] Chave '${key}' salva (TTL: ${ttlSeconds || 'indefinido'}s, ${durationMs}ms)`, {
      event: 'CACHE_SET',
      key,
      ttlSeconds,
      durationMs,
    }, requestId);
  }

  /**
   * Invalida uma chave no cache
   */
  public async delete(key: string, requestId?: string): Promise<void> {
    this.store.delete(key);
    logger.info(`[CACHE DELETE] Chave '${key}' removida`, {
      event: 'CACHE_DELETE',
      key,
    }, requestId);
  }

  /**
   * Retorna contadores atuais do cache
   */
  public getStats() {
    const snapshot = metricsRegistry.getSnapshot();
    return snapshot.cache;
  }
}

export const cacheClient = new TrackedCacheClient();
