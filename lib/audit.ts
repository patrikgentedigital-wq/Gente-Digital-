import { supabase, isSupabaseConfigured } from './supabase';

export interface AuditLog {
  id?: number | string;
  action: string;
  user_email: string;
  details: string;
  created_at?: string;
}

export async function logAuditEvent(action: string, details: string, user_email = 'Admin') {
  try {
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('audit_logs').insert([{
          action,
          details,
          user_email,
          created_at: new Date().toISOString(),
        }]);
        if (error) {
          console.warn('Supabase audit insert warning (usando fallback local):', error.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('Falha na requisição de auditoria para o Supabase (usando fallback local):', message);
      }
    }

    // O fallback local mantém a resposta imediata da interface quando a auditoria remota não está disponível.
    if (typeof window !== 'undefined') {
      const existingLogsRaw = localStorage.getItem('gente_digital_audit_logs');
      const existingLogs: AuditLog[] = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];
      const newLog: AuditLog = {
        id: Date.now(),
        action,
        details,
        user_email,
        created_at: new Date().toLocaleString('pt-BR'),
      };

      const updatedLogs = [newLog, ...existingLogs].slice(0, 100);
      localStorage.setItem('gente_digital_audit_logs', JSON.stringify(updatedLogs));
    }
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}
