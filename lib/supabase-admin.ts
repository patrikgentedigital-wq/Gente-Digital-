import 'server-only';

import { createClient } from '@supabase/supabase-js';

const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
  ? rawUrl.replace(/\/+$/, '')
  : 'https://placeholder.supabase.co';

// The Service Role key gives full admin access and bypasses RLS. Never expose it to the client.
// NÃO há fallback para anon key: operações administrativas exigem a Service Role key.
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const isProd = process.env.NODE_ENV === 'production';

// Cliente criado mesmo sem credenciais para não quebrar imports estáticos;
// as rotas devem checar `isSupabaseAdminConfigured` antes de usá-lo.
export const isSupabaseAdminConfigured = !!serviceRoleKey && !supabaseUrl.includes('placeholder');

if (!isSupabaseAdminConfigured) {
  if (isProd) {
    // Log explícito obrigatório em produção (uma vez por instância, no load do módulo)
    console.error(
      'ALERTA DE SEGURANÇA CRÍTICO: SUPABASE_SERVICE_ROLE_KEY não configurada (ou URL placeholder) em produção. ' +
      'Rotas administrativas com supabaseAdmin falharão até a variável ser definida.'
    );
  } else {
    console.warn('AVISO: SUPABASE_SERVICE_ROLE_KEY ausente no ambiente de dev — supabaseAdmin não está operacional.');
  }
}

const supabaseServiceKey = serviceRoleKey || 'placeholder_key';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
