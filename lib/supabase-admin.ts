import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
// The Service Role key gives full admin access and bypasses RLS. Never expose it to the client.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_key';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
