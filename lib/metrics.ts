/**
 * Sistema de Métricas de Performance do Serviço (DevOps Regra 7)
 * 
 * Regra 7: Medição contínua de Tempo de resposta, Memória e CPU.
 * Permite expor métricas agregadas em JSON e formato Prometheus.
 */

export interface SystemMetricsSnapshot {
  uptime_seconds: number;
  memory: {
    rss_bytes: number;
    heap_total_bytes: number;
    heap_used_bytes: number;
    external_bytes: number;
    heap_used_percent: number;
  };
  cpu: {
    user_microseconds: number;
    system_microseconds: number;
  };
  http: {
    requests_total: number;
    errors_total: number;
    avg_latency_ms: number;
  };
  database: {
    queries_total: number;
    avg_latency_ms: number;
    slow_queries_total: number;
  };
  cache: {
    hits_total: number;
    misses_total: number;
    hit_ratio_percent: number;
  };
}

class PerformanceMetricsRegistry {
  private startTime: number = Date.now();
  private httpRequestsTotal: number = 0;
  private httpErrorsTotal: number = 0;
  private httpLatencySumMs: number = 0;

  private dbQueriesTotal: number = 0;
  private dbSlowQueriesTotal: number = 0;
  private dbLatencySumMs: number = 0;

  private cacheHitsTotal: number = 0;
  private cacheMissesTotal: number = 0;

  // Registrar requisição HTTP
  public recordHttpRequest(durationMs: number, statusCode: number) {
    this.httpRequestsTotal++;
    this.httpLatencySumMs += durationMs;
    if (statusCode >= 400) {
      this.httpErrorsTotal++;
    }
  }

  // Registrar consulta de banco de dados
  public recordDbQuery(durationMs: number, isSlow: boolean = false) {
    this.dbQueriesTotal++;
    this.dbLatencySumMs += durationMs;
    if (isSlow) {
      this.dbSlowQueriesTotal++;
    }
  }

  // Registrar evento de Cache
  public recordCacheHit() {
    this.cacheHitsTotal++;
  }

  public recordCacheMiss() {
    this.cacheMissesTotal++;
  }

  // Capturar snapshot do estado do sistema
  public getSnapshot(): SystemMetricsSnapshot {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const totalCacheOps = this.cacheHitsTotal + this.cacheMissesTotal;
    const hitRatio = totalCacheOps > 0 ? (this.cacheHitsTotal / totalCacheOps) * 100 : 100;

    return {
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      memory: {
        rss_bytes: mem.rss,
        heap_total_bytes: mem.heapTotal,
        heap_used_bytes: mem.heapUsed,
        external_bytes: mem.external,
        heap_used_percent: Number(((mem.heapUsed / mem.heapTotal) * 100).toFixed(2)),
      },
      cpu: {
        user_microseconds: cpu.user,
        system_microseconds: cpu.system,
      },
      http: {
        requests_total: this.httpRequestsTotal,
        errors_total: this.httpErrorsTotal,
        avg_latency_ms: this.httpRequestsTotal > 0 
          ? Number((this.httpLatencySumMs / this.httpRequestsTotal).toFixed(2)) 
          : 0,
      },
      database: {
        queries_total: this.dbQueriesTotal,
        avg_latency_ms: this.dbQueriesTotal > 0 
          ? Number((this.dbLatencySumMs / this.dbQueriesTotal).toFixed(2)) 
          : 0,
        slow_queries_total: this.dbSlowQueriesTotal,
      },
      cache: {
        hits_total: this.cacheHitsTotal,
        misses_total: this.cacheMissesTotal,
        hit_ratio_percent: Number(hitRatio.toFixed(2)),
      },
    };
  }

  // Exportar métricas no formato padrão Prometheus (text/plain)
  public toPrometheusFormat(): string {
    const snapshot = this.getSnapshot();
    const lines: string[] = [
      '# HELP process_uptime_seconds Tempo de execução do processo em segundos.',
      '# TYPE process_uptime_seconds counter',
      `process_uptime_seconds ${snapshot.uptime_seconds}`,

      '# HELP process_resident_memory_bytes Uso de memória física (RSS).',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${snapshot.memory.rss_bytes}`,

      '# HELP process_heap_used_bytes Uso de memória Heap usada.',
      '# TYPE process_heap_used_bytes gauge',
      `process_heap_used_bytes ${snapshot.memory.heap_used_bytes}`,

      '# HELP process_heap_used_percent Porcentagem de Heap usada.',
      '# TYPE process_heap_used_percent gauge',
      `process_heap_used_percent ${snapshot.memory.heap_used_percent}`,

      '# HELP process_cpu_user_seconds Tempo de CPU em modo usuário.',
      '# TYPE process_cpu_user_seconds counter',
      `process_cpu_user_seconds ${snapshot.cpu.user_microseconds / 1000000}`,

      '# HELP http_requests_total Total de requisições HTTP processadas.',
      '# TYPE http_requests_total counter',
      `http_requests_total ${snapshot.http.requests_total}`,

      '# HELP http_errors_total Total de erros HTTP (4xx e 5xx).',
      '# TYPE http_errors_total counter',
      `http_errors_total ${snapshot.http.errors_total}`,

      '# HELP db_queries_total Total de consultas executadas no banco de dados.',
      '# TYPE db_queries_total counter',
      `db_queries_total ${snapshot.database.queries_total}`,

      '# HELP db_slow_queries_total Total de consultas de banco de dados lentas (>200ms).',
      '# TYPE db_slow_queries_total counter',
      `db_slow_queries_total ${snapshot.database.slow_queries_total}`,

      '# HELP cache_hits_total Total de hits no cache.',
      '# TYPE cache_hits_total counter',
      `cache_hits_total ${snapshot.cache.hits_total}`,

      '# HELP cache_misses_total Total de misses no cache.',
      '# TYPE cache_misses_total counter',
      `cache_misses_total ${snapshot.cache.misses_total}`,

      '# HELP cache_hit_ratio_percent Taxa de acerto do cache em porcentagem.',
      '# TYPE cache_hit_ratio_percent gauge',
      `cache_hit_ratio_percent ${snapshot.cache.hit_ratio_percent}`,
    ];

    return lines.join('\n') + '\n';
  }
}

export const metricsRegistry = new PerformanceMetricsRegistry();
