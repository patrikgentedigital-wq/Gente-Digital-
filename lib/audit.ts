export interface AuditLog {
  id?: number | string;
  action: string;
  user_email: string;
  details: string;
  created_at?: string;
}

/**
 * Registra evento de auditoria de forma segura para uso em cliente e servidor.
 * O insert no banco é feito via endpoint server-side /api/audit para que este
 * módulo NUNCA importe supabase-admin no bundle do cliente.
 * Mantém fallback em localStorage para resposta instantânea na UI.
 */
export async function logAuditEvent(action: string, details: string, user_email = 'Admin') {
  try {
    const endpoint = '/api/audit';
    let delivered = false;

    // 1. Enviar para o endpoint server-side (keepalive para tentar concluir mesmo no unload da página)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, details, user_email }),
        keepalive: true,
      });
      delivered = res.ok || res.status === 204;
    } catch (e: any) {
      console.warn('Falha ao enviar auditoria para /api/audit (usando fallback local):', e?.message || e);
    }

    // Fallback: se o endpoint falhou, grava localmente para posterior sincronização
    if (!delivered && typeof window !== 'undefined') {
      const existingLogsRaw = localStorage.getItem('gente_digital_audit_logs');
      const existingLogs: AuditLog[] = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];

      const newLog: AuditLog = {
        id: Date.now(),
        action,
        details,
        user_email,
        created_at: new Date().toLocaleString('pt-BR')
      };

      const updatedLogs = [newLog, ...existingLogs].slice(0, 100); // Keep last 100 logs
      localStorage.setItem('gente_digital_audit_logs', JSON.stringify(updatedLogs));
    }
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}
