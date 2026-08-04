import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { matchCollaboratorReference } from '@/lib/referral-matching';

/**
 * Stores new referrals with the collaborator code whenever the supplied name
 * can be resolved unambiguously. Legacy free-text references remain readable.
 */
export async function canonicalizeReferral(reference: string) {
  const { data, error } = await supabaseAdmin
    .from('colaboradores')
    .select('id, name');

  if (error || !data) return reference;

  return matchCollaboratorReference(reference, data)?.id || reference;
}
