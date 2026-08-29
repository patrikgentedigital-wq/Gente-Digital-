import { supabase } from './supabase';
import { supabaseAdmin } from './supabase-admin';

export interface AuditLog {
  id?: number | string;
  action: string;
  user_email: string;
  details: string;
  created_at?: string;
}

export async function logAuditEvent(action: string, details: string, user_email = 'Admin') {
  try {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const isConfigured = !!rawUrl && !rawUrl.includes('placeholder');

    if (isConfigured) {
      try {
        const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
        const { error } = await client.from('audit_logs').insert([{
          action,
          details,
          user_email,
          created_at: new Date().toISOString()
        }]);
        if (error) {
          console.warn('Supabase audit insert warning (usando fallback local):', error.message);
        }
      } catch (e: any) {
        console.warn('Falha na requisição de auditoria para o Supabase (usando fallback local):', e?.message || e);
      }
    }

    // Save to local storage as fallback for instant UI response
    if (typeof window !== 'undefined') {
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
