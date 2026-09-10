import 'server-only';

import { isSupabaseAdminConfigured, supabaseAdmin } from './supabase-admin';

export async function logAuditEventServer(action: string, details: string, userEmail = 'Admin'): Promise<void> {
  if (!isSupabaseAdminConfigured) return;

  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert([{
      action,
      details,
      user_email: userEmail,
      created_at: new Date().toISOString(),
    }]);
    if (error) console.warn('Supabase audit insert warning:', error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Falha na requisição de auditoria para o Supabase:', message);
  }
}
