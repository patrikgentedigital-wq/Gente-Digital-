import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
  ? rawUrl
  : 'https://placeholder.supabase.co';

// Operações administrativas exigem a service role. Nunca use a anon key como fallback.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseAdminConfigured = Boolean(
  serviceRoleKey && !supabaseUrl.includes('placeholder'),
);

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || 'placeholder_key', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
