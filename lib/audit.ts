export interface AuditLog {
  id?: number | string;
  action: string;
  user_email: string;
  details: string;
  created_at?: string;
}

export async function logAuditEvent(action: string, details: string) {
  try {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, details }),
      credentials: 'same-origin',
    });
    if (!response.ok) console.warn('Audit event was not persisted.');
  } catch {
    console.warn('Audit event request failed.');
  }
}
