import { createHash } from 'node:crypto';
import { readBoundedBody, type Actor } from './handler';
import type { Point } from './domain/types';
import type { FetchLike } from './adapters/ports';

export type StreetSearch = { street: string; neighborhood: string; city: string };
export type StreetPlace = { id: string; label: string; city: string; location: Point };
type Dependencies = {
  authenticate(request: Request): Promise<Actor | null>;
  claimSlot(): Promise<boolean>;
  getCached(key: string): Promise<StreetPlace[] | null>;
  putCached(key: string, places: StreetPlace[]): Promise<void>;
  locate(input: StreetSearch): Promise<StreetPlace[]>;
  cacheNamespace?: string;
};
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
const safeText = (value: unknown, maximum: number) => typeof value === 'string' && value.length <= maximum
  && /^[\p{L}\p{N}\s.'’\-ªº/]*$/u.test(value) && !/\d{7,}/.test(value);

function parseSearch(value: unknown): StreetSearch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['street', 'neighborhood', 'city'].includes(key))) return null;
  if (!safeText(body.city, 80) || String(body.city).trim().length < 2
    || !safeText(body.street ?? '', 120) || !safeText(body.neighborhood ?? '', 100)) return null;
  return { street: String(body.street ?? '').trim(), neighborhood: String(body.neighborhood ?? '').trim(), city: String(body.city).trim() };
}

export function createStreetGeocoder(options: { url?: string; userAgent?: string } = {}, fetcher: FetchLike = fetch) {
  const endpoint = new URL(options.url || 'https://nominatim.openstreetmap.org/search');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('GEOCODING_CONFIGURATION_INVALID');
  return async (input: StreetSearch): Promise<StreetPlace[]> => {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ q: [input.street, input.neighborhood, input.city, 'Pará', 'Brasil'].filter(Boolean).join(', '),
      format: 'jsonv2', addressdetails: '1', countrycodes: 'br', limit: '5', 'accept-language': 'pt-BR' }).toString();
    const response = await fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8_000),
      headers: { 'user-agent': options.userAgent || 'GenteDigital-Viabilidade/1.0 (+https://gentedigital.vercel.app)', accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length')) > 65_536 || !response.body) throw Error('GEOCODING_UNAVAILABLE');
    const reader = response.body.getReader();
    let length = 0, text = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 65_536) { await reader.cancel(); throw Error('GEOCODING_RESPONSE_TOO_LARGE'); }
        text += decoder.decode(chunk.value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    const raw: unknown = JSON.parse(text + decoder.decode());
    if (!Array.isArray(raw) || raw.length > 5) throw Error('GEOCODING_RESPONSE_INVALID');
    return raw.flatMap((value): StreetPlace[] => {
      if (!value || typeof value !== 'object' || !value.address || typeof value.address !== 'object') return [];
      const address = value.address as Record<string, unknown>;
      const city = address.city ?? address.town ?? address.municipality ?? address.county ?? address.village;
      if (typeof city !== 'string' || normalize(city) !== normalize(input.city) || address.country_code !== 'br'
        || !(typeof address.state === 'string' && normalize(address.state) === 'para' || address['ISO3166-2-lvl4'] === 'BR-PA')) return [];
      if (typeof value.lat !== 'string' || typeof value.lon !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value.lat) || !/^-?\d+(?:\.\d+)?$/.test(value.lon)) return [];
      const latitude = Number(value.lat), longitude = Number(value.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
        || !['way', 'node', 'relation'].includes(value.osm_type) || !/^\d+$/.test(String(value.osm_id))) return [];
      const label = [...new Set([address.road ?? input.street, address.suburb ?? address.neighbourhood, city, 'Pará']
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0).map(part => part.trim()))].join(', ').slice(0, 240);
      return [{ id: `${value.osm_type[0].toUpperCase()}${value.osm_id}`, label, city, location: { latitude, longitude } }];
    });
  };
}

export function createGeocodingHandler(deps: Dependencies) {
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } });
  return async (request: Request): Promise<Response> => {
    try {
      if (!await deps.authenticate(request)) return json({ error: 'UNAUTHORIZED' }, 401);
      if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
      const url = new URL(request.url), protocol = request.headers.get('x-forwarded-proto');
      const publicOrigin = (protocol === 'https' || protocol === 'http' ? protocol + ':' : url.protocol) + '//' + (request.headers.get('host') ?? url.host);
      if (request.headers.get('origin') !== publicOrigin) return json({ error: 'ORIGIN_REFUSED' }, 403);
      if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return json({ error: 'APPLICATION_JSON_REQUIRED' }, 415);
      const body = await readBoundedBody(request, 2048);
      if (body.tooLarge) return json({ error: 'BODY_TOO_LARGE' }, 413);
      let parsed: unknown;
      try { parsed = JSON.parse(body.text ?? ''); } catch { return json({ error: 'INVALID_JSON' }, 400); }
      const input = parseSearch(parsed);
      if (!input) return json({ error: 'ADDRESS_INPUT_INVALID' }, 400);
      const key = createHash('sha256').update(JSON.stringify([deps.cacheNamespace ?? 'nominatim-public-v1', normalize(input.street), normalize(input.neighborhood), normalize(input.city)])).digest('hex');
      const cached = await deps.getCached(key);
      if (cached) return json({ places: cached, cached: true });
      if (!await deps.claimSlot()) return json({ error: 'GEOCODING_BUSY' }, 429, { 'retry-after': '2' });
      const places = await deps.locate(input);
      await deps.putCached(key, places);
      return json({ places, cached: false });
    } catch { return json({ error: 'ADDRESS_SEARCH_UNAVAILABLE' }, 503); }
  };
}
