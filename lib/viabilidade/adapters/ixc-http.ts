import type { IxcCto, Region } from '../domain/types';
import type { FetchLike, IxcPage, IxcReadClient } from './ports';

type SelectorField = 'id_projeto' | 'id_cidade' | 'id_transmissor';
type RegionSelector = { field: SelectorField; values: string[] };
export type IxcHttpOptions = {
  baseUrl: string;
  webserviceToken: string;
  regionSelectors: Record<Region, RegionSelector>;
  pageSize?: number;
};

function nonnegativeInteger(value: unknown): number | null {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function coordinate(value: unknown, limit: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value.trim())) throw new Error('IXC_SCHEMA_ERROR');
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('IXC_SCHEMA_ERROR');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) throw new Error('IXC_SCHEMA_ERROR');
  return parsed;
}

function normalizeRecord(raw: unknown, region: Region, selector: RegionSelector): IxcCto {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('IXC_SCHEMA_ERROR');
  const row = raw as Record<string, unknown>;
  const id = nonnegativeInteger(row.id);
  const selectedId = nonnegativeInteger(row[selector.field]);
  if (id === null || id === 0 || selectedId === null || !selector.values.includes(String(selectedId))
    || typeof row.descricao !== 'string' || !row.descricao.trim()
    || (row.status !== 'A' && row.status !== 'I')) throw new Error('IXC_SCHEMA_ERROR');
  const capacity = row.capacidade === null || row.capacidade === undefined || row.capacidade === ''
    ? null : nonnegativeInteger(row.capacidade);
  if (row.capacidade !== null && row.capacidade !== undefined && row.capacidade !== '' && capacity === null) {
    throw new Error('IXC_SCHEMA_ERROR');
  }
  const latitude = coordinate(row.latitude, 90);
  const longitude = coordinate(row.longitude, 180);
  return {
    id: String(id), originalName: row.descricao.trim(), region,
    active: row.status === 'A', capacity,
    location: latitude === null || longitude === null ? null : { latitude, longitude }
  };
}

function parsePageToken(token: string | undefined): { page: number; expectedTotal: number | null } {
  if (token === undefined) return { page: 1, expectedTotal: null };
  const match = token.match(/^(\d+):(\d+)$/);
  const page = nonnegativeInteger(match?.[1]);
  const total = nonnegativeInteger(match?.[2]);
  if (page === null || page < 2 || total === null) throw new Error('IXC_PAGE_TOKEN_INVALID');
  return { page, expectedTotal: total };
}

// O endpoint e os campos são documentados pelo IXC. O envelope abaixo precisa
// ser validado com uma leitura autorizada da instância antes de habilitar LIVE.
export function createIxcHttpClient(options: IxcHttpOptions, fetcher: FetchLike = fetch): IxcReadClient {
  const base = new URL(options.baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
    || !['/', '/webservice/v1', '/webservice/v1/'].includes(base.pathname)) {
    throw new Error('Origem IXC inválida: usar a URL HTTPS da instância ou /webservice/v1.');
  }
  if (!/^[1-9]\d*:[^\s:]+$/.test(options.webserviceToken)) throw new Error('Credencial Webservice IXC inválida.');
  const pageSize = options.pageSize ?? 100;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 400) throw new Error('Tamanho de página IXC inválido.');
  const selectors = {} as Record<Region, RegionSelector>;
  for (const region of ['AC', 'CP'] as const) {
    const selector = options.regionSelectors?.[region];
    if (!selector || !['id_projeto', 'id_cidade', 'id_transmissor'].includes(selector.field)
      || !Array.isArray(selector.values) || !selector.values.length
      || selector.values.some((value) => typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
        || !Number.isSafeInteger(Number(value)))) throw new Error('Seleção regional IXC inválida.');
    selectors[region] = { field: selector.field, values: [...new Set(selector.values)] };
  }
  if (selectors.AC.field !== selectors.CP.field
    || selectors.AC.values.some((id) => selectors.CP.values.includes(id))) {
    throw new Error('As regiões IXC precisam usar o mesmo campo e IDs distintos.');
  }
  const endpoint = new URL('/webservice/v1/rad_caixa_ftth', base.origin);
  const authorization = 'Basic ' + Buffer.from(options.webserviceToken, 'utf8').toString('base64');

  return {
    async listCaixas(region, pageToken, signal): Promise<IxcPage> {
      if (signal.aborted) throw new Error('IXC_READ_CANCELLED');
      const selector = selectors[region];
      if (!selector) throw new Error('IXC_REGION_INVALID');
      const { page, expectedTotal } = parsePageToken(pageToken);
      const body = JSON.stringify({
        qtype: 'rad_caixa_ftth.id', query: '0', oper: '>',
        page: String(page), rp: String(pageSize), sortname: 'rad_caixa_ftth.id', sortorder: 'asc',
        grid_param: JSON.stringify([{ TB: 'rad_caixa_ftth.' + selector.field, OP: 'IN', P: selector.values.join(',') }])
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        let response: Response;
        try {
          response = await fetcher(endpoint, {
            method: 'POST', headers: { authorization, ixcsoft: 'listar', 'content-type': 'application/json' },
            body, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)])
          });
        } catch {
          if (attempt === 0 && !signal.aborted) continue;
          throw new Error('IXC_TRANSPORT_UNAVAILABLE');
        }
        if (!response.ok) {
          if (attempt === 0 && !signal.aborted && (response.status === 429 || response.status >= 500)) continue;
          throw new Error('IXC_HTTP_REFUSED');
        }
        let payload: unknown;
        try { payload = await response.json(); } catch { throw new Error('IXC_SCHEMA_ERROR'); }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('IXC_SCHEMA_ERROR');
        const result = payload as Record<string, unknown>;
        if (result.type === 'error') throw new Error('IXC_READ_REFUSED');
        const total = nonnegativeInteger(result.total);
        const responsePage = nonnegativeInteger(result.page);
        if (total === null || responsePage !== page || !Array.isArray(result.registros)
          || (expectedTotal !== null && expectedTotal !== total)) throw new Error('IXC_SCHEMA_ERROR');
        const expectedRows = Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize));
        if (result.registros.length !== expectedRows || (page > 1 && expectedRows === 0)) {
          throw new Error('IXC_PAGE_INCOMPLETE');
        }
        const rows = result.registros.map((row) => normalizeRecord(row, region, selector));
        return {
          rows,
          ...((page * pageSize) < total ? { nextPageToken: (page + 1) + ':' + total } : {})
        };
      }
      throw new Error('IXC_TRANSPORT_UNAVAILABLE');
    }
  };
}
