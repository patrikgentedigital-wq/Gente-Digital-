import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
  ? rawUrl
  : 'https://placeholder.supabase.co';

// The Service Role key gives full admin access and bypasses RLS. Never expose it to the client.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !serviceRoleKey && !supabaseUrl.includes('placeholder')) {
  console.error('ALERTA DE SEGURANÇA: SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente de produção. Operações administrativas podem ser bloqueadas por RLS.');
}

const supabaseServiceKey = 
  serviceRoleKey || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  'placeholder_key';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
