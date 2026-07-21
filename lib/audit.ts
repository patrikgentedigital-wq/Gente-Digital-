import { supabase } from './supabase';

export interface AuditLog {
  id?: number | string;
  action: string;
  user_email: string;
  details: string;
  created_at?: string;
}

export async function logAuditEvent(action: string, details: string, user_email = 'Admin') {
  try {
    const isConfigured = typeof window !== 'undefined' && 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isConfigured) {
      try {
        await supabase.from('audit_logs').insert([{
          action,
          details,
          user_email,
          created_at: new Date().toISOString()
        }]);
      } catch (e) {}
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
