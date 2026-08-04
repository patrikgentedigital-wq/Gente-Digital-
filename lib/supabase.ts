import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';

// Se o cookie do Supabase for removido pelo usuário, limpa o localStorage correspondente
// para evitar que o cliente reidrate a sessão deletada.
if (typeof window !== 'undefined') {
  const hasAuthCookie = document.cookie.split(';').some(c => c.trim().startsWith('sb-'));
  if (!hasAuthCookie) {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('Erro ao limpar localStorage:', e);
    }
  }
}

export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = () => {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
};

// Realtime fica opt-in para evitar reconexões infinitas quando o endpoint WebSocket
// está indisponível ou bloqueado pela rede do usuário. As telas continuam usando
// consultas HTTP normalmente e o recurso pode ser reativado via ambiente.
export const isSupabaseRealtimeEnabled = () => {
  return isSupabaseConfigured() && process.env.NEXT_PUBLIC_ENABLE_REALTIME === 'true';
};
// Interfaces for our tables
export interface Lead {
  id: number;
  name: string;
  phone: string;
  ref: string;
  status: string;
  value?: number;
  created_at?: string;
  tracking_code?: string | null;
  submission_key?: string | null;
  source?: string | null;
  consent_at?: string | null;
}

export interface LeadHistory {
  id: number;
  lead_id: number;
  date: string;
  action: string;
  note: string | null;
}

export interface Colaborador {
  id: string; // The text ID like 'EMP-042'
  name: string;
  email: string;
  initials: string;
  count: number;
  photo_url?: string;
  role?: 'admin' | 'colaborador';
  created_at?: string;
}
