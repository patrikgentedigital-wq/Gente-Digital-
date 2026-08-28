import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
  ? rawUrl
  : 'https://placeholder.supabase.co';

// The Service Role key gives full admin access and bypasses RLS. Never expose it to the client.
// Se SUPABASE_SERVICE_ROLE_KEY não for definido, usa NEXT_PUBLIC_SUPABASE_ANON_KEY como fallback.
const supabaseServiceKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  'placeholder_key';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
