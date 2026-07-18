import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';

export const supabase = createClient(supabaseUrl, supabaseKey);

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
  created_at?: string;
}
