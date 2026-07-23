import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';

export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = () => {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
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
