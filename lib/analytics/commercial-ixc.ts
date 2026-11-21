import 'server-only';

import { normalizeSourceBusinessDate } from './normalizers';

export interface CommercialPeriod {
  from: string;
  to: string;
}

interface CommercialRecordIds {
  id: string;
  date: string;
  channel: string | null;
  responsible: string | null;
}

export interface CommercialRecord extends CommercialRecordIds {
  channelName: string | null;
  responsibleName: string | null;
}

type Metric = 'leads' | 'sales' | 'contracts';
export type CommercialMetrics = Record<Metric, CommercialRecord[] | null>;

const sources = {
  leads: { table: 'contato', date: 'data_cadastro', channel: 'id_candidato_tipo', responsible: 'id_responsavel' },
  sales: { table: 'crm_negociacoes', date: 'data_vencemos', channel: 'id_canal_origem', responsible: 'id_responsavel' },
  contracts: { table: 'cliente_contrato', date: 'data_cadastro_sistema', channel: null, responsible: 'id_vendedor' },
} as const;

type Source = (typeof sources)[Metric];
const catalogs = {
  channel: { table: 'crm_tipo_candidato', field: 'tipo' },
  employee: { table: 'funcionarios', field: 'funcionario' },
  seller: { table: 'vendedor', field: 'nome' },
} as const;

type Catalog = (typeof catalogs)[keyof typeof catalogs];
type ListTable = Source['table'] | Catalog['table'];
type List = (table: ListTable, body: Record<string, string>) => Promise<unknown>;
type IxcRow = Record<string, unknown>;
type CatalogById = ReadonlyMap<string, string>;
const businessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' });
const DAY = 86_400_000;
const PAGE_SIZE = 250;
const MAX_PAGES = 20;

export function parseCommercialPeriod(params: URLSearchParams): CommercialPeriod {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const dates = [[from, fromMs], [to, toMs]] as const;
  if (dates.some(([input, ms]) => !/^\d{4}-\d{2}-\d{2}$/.test(input)
    || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== input)
    || fromMs > toMs || toMs - fromMs >= 92 * DAY) {
    throw new Error('Informe um período válido de até 92 dias.');
  }
  return { from, to };
}

function positiveId(value: unknown): string | null {
  const id = typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
    ? String(value).trim() : '';
  return /^[1-9]\d*$/.test(id) ? id : null;
}

async function loadIxcRows(table: ListTable, filters: Record<string, string>, list: List): Promise<Map<string, IxcRow>> {
  const records = new Map<string, IxcRow>();
  let expectedTotal: number | undefined;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const value = await list(table, {
      ...filters,
      sortname: table + '.id', sortorder: 'asc',
      page: String(page), rp: String(PAGE_SIZE),
    });
    const payload = value as { total?: unknown; registros?: unknown; type?: string; error?: unknown } | null;
    const total = typeof payload?.total === 'number' || typeof payload?.total === 'string'
      ? (/^\d+$/.test(String(payload.total)) ? Number(payload.total) : NaN)
      : NaN;
    if (!payload || payload.type === 'error' || payload.error || !Number.isSafeInteger(total)
      || total > PAGE_SIZE * MAX_PAGES || (expectedTotal !== undefined && total !== expectedTotal)) {
      throw new Error('Total inválido ou alterado durante a consulta ao IXC.');
    }
    expectedTotal = total;

    const rows = payload.registros ?? (total === 0 ? [] : null);
    if (!Array.isArray(rows) || rows.length !== Math.min(PAGE_SIZE, total - records.size)) {
      throw new Error('A consulta ao IXC retornou uma página incompleta.');
    }
    for (const row of rows) {
      const id = positiveId(row?.id);
      if (!id || records.has(id)) {
        throw new Error('A consulta ao IXC retornou um registro inválido ou repetido.');
      }
      records.set(id, row);
    }
    if (records.size === total) return records;
  }
  throw new Error('Limite de páginas do IXC excedido.');
}

async function loadRecords(source: Source, period: CommercialPeriod, list: List): Promise<CommercialRecordIds[]> {
  const field = source.table + '.' + source.date;
  const endExclusive = new Date(Date.parse(period.to) + DAY).toISOString().slice(0, 10);
  const rows = await loadIxcRows(source.table, {
    qtype: field, query: period.from, oper: '>=',
    grid_param: JSON.stringify([{ TB: field, OP: '<', P: endExclusive }]),
  }, list);
  return Array.from(rows, ([id, row]) => {
    const timestamp = normalizeSourceBusinessDate(row[source.date]);
    const date = timestamp ? businessDay.format(new Date(timestamp)) : null;
    if (!date || date < period.from || date > period.to) {
      throw new Error('A consulta ao IXC retornou um registro fora do período.');
    }
    return {
      id, date,
      channel: source.channel ? positiveId(row[source.channel]) : null,
      responsible: positiveId(row[source.responsible]),
    };
  });
}

async function loadCatalog(catalog: Catalog, list: List): Promise<CatalogById> {
  const rows = await loadIxcRows(catalog.table, {
    qtype: catalog.table + '.id', query: '1', oper: '>=',
  }, list);
  const names = new Map<string, string>();
  for (const [id, row] of rows) {
    const name = row[catalog.field];
    if (typeof name === 'string' && name.trim()) names.set(id, name.trim());
  }
  return names;
}

function withNames(
  records: PromiseSettledResult<CommercialRecordIds[]>,
  channel: PromiseSettledResult<CatalogById>,
  responsible: PromiseSettledResult<CatalogById>,
): CommercialRecord[] | null {
  if (records.status === 'rejected') return null;
  return records.value.map((record) => ({
    ...record,
    channelName: record.channel && channel.status === 'fulfilled' ? channel.value.get(record.channel) ?? null : null,
    responsibleName: record.responsible && responsible.status === 'fulfilled' ? responsible.value.get(record.responsible) ?? null : null,
  }));
}

export async function loadCommercialMetrics(period: CommercialPeriod, list: List): Promise<CommercialMetrics> {
  const [leads, sales, contracts, channels, employees, sellers] = await Promise.allSettled([
    loadRecords(sources.leads, period, list),
    loadRecords(sources.sales, period, list),
    loadRecords(sources.contracts, period, list),
    loadCatalog(catalogs.channel, list),
    loadCatalog(catalogs.employee, list),
    loadCatalog(catalogs.seller, list),
  ]);
  return {
    leads: withNames(leads, channels, employees),
    sales: withNames(sales, channels, employees),
    contracts: withNames(contracts, channels, sellers),
  };
}
