/**
 * Sistema de Logging Estruturado em JSON (DevOps Regras 2 e 3)
 * 
 * Regra 2: Todo erro possui um Stack Trace completo e em texto.
 * Regra 3: Todo log é emitido estritamente como um objeto JSON estruturado.
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface StructuredLogPayload {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  requestId?: string;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack: string;
    cause?: any;
  };
}

class StructuredLogger {
  private serviceName: string = 'gente-digital';
  private environment: string = process.env.NODE_ENV || 'development';

  /**
   * Extrai e formata o stack trace completo como texto continuo com quebras tratadas.
   */
  private formatError(err: unknown) {
    if (!err) return undefined;

    if (err instanceof Error) {
      return {
        name: err.name || 'Error',
        message: err.message || String(err),
        stack: err.stack || new Error().stack || 'No stack trace available',
        cause: err.cause ? String(err.cause) : undefined,
      };
    }

    if (typeof err === 'object') {
      const errObj = err as any;
      return {
        name: errObj.name || 'CustomObjectError',
        message: errObj.message || JSON.stringify(err),
        stack: errObj.stack || new Error().stack || 'No stack trace available',
      };
    }

    return {
      name: 'UnknownError',
      message: String(err),
      stack: new Error().stack || 'No stack trace available',
    };
  }

  private emit(level: LogLevel, message: string, meta?: Record<string, any>, err?: unknown, requestId?: string) {
    const payload: StructuredLogPayload = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      requestId: requestId || meta?.requestId || undefined,
      message,
      metadata: meta ? { ...meta } : undefined,
      error: err ? this.formatError(err) : undefined,
    };

    // Remover undefined das propriedades no JSON final
    if (payload.metadata && 'requestId' in payload.metadata) {
      delete payload.metadata.requestId;
    }
    if (payload.metadata && Object.keys(payload.metadata).length === 0) {
      delete payload.metadata;
    }

    const jsonLog = JSON.stringify(payload);

    if (level === 'ERROR') {
      console.error(jsonLog);
    } else if (level === 'WARN') {
      console.warn(jsonLog);
    } else {
      console.log(jsonLog);
    }

    return payload;
  }

  public info(message: string, meta?: Record<string, any>, requestId?: string) {
    return this.emit('INFO', message, meta, undefined, requestId);
  }

  public warn(message: string, meta?: Record<string, any>, requestId?: string) {
    return this.emit('WARN', message, meta, undefined, requestId);
  }

  public error(message: string, err?: unknown, meta?: Record<string, any>, requestId?: string) {
    const payload = this.emit('ERROR', message, meta, err, requestId);
    // Envio assíncrono para o Microsoft Teams se a webhook URL estiver configurada (Regra 9)
    if (process.env.TEAMS_WEBHOOK_URL) {
      import('./teams-notifier').then(({ sendTeamsAlert }) => {
        sendTeamsAlert(payload).catch(() => {});
      }).catch(() => {});
    }
    return payload;
  }

  public debug(message: string, meta?: Record<string, any>, requestId?: string) {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
      return this.emit('DEBUG', message, meta, undefined, requestId);
    }
  }
}

export const logger = new StructuredLogger();
