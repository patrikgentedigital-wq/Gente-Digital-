import { NextRequest } from 'next/server';
import { getAuthenticatedUser, getUserRole } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createGeocodingHandler, createStreetGeocoder, type StreetPlace } from '@/lib/viabilidade/geocoding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const handler = createGeocodingHandler({
    cacheNamespace: process.env.VIABILITY_GEOCODING_URL || 'nominatim-public-v1',
    authenticate: async () => {
      const user = await getAuthenticatedUser(request);
      if (!user || user.id === 'dev-local') return null;
      const role = await getUserRole(user.id);
      return role === 'admin' || role === 'vendedor' ? user : null;
    },
    claimSlot: async () => {
      const { data, error } = await supabaseAdmin.rpc('viability_claim_geocoding_slot');
      if (error) throw Error('GEOCODING_GATE_UNAVAILABLE');
      return data === true;
    },
    getCached: async key => {
      const { data, error } = await supabaseAdmin.from('viability_geocoding_cache').select('places').eq('query_hash', key)
        .gt('expires_at', new Date().toISOString()).maybeSingle();
      if (error) throw Error('GEOCODING_CACHE_UNAVAILABLE');
      return data ? data.places as StreetPlace[] : null;
    },
    putCached: async (key, places) => {
      const { error } = await supabaseAdmin.from('viability_geocoding_cache').upsert({ query_hash: key, places,
        expires_at: new Date(Date.now() + 86_400_000).toISOString() });
      if (error) throw Error('GEOCODING_CACHE_UNAVAILABLE');
      await supabaseAdmin.from('viability_geocoding_cache').delete().lt('expires_at', new Date().toISOString());
    },
    locate: input => createStreetGeocoder({ ...(process.env.VIABILITY_GEOCODING_URL ? { url: process.env.VIABILITY_GEOCODING_URL } : {}) })(input),
  });
  return handler(request);
}
