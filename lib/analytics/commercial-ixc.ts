import 'server-only';

import { normalizeSourceBusinessDate } from './normalizers';

export interface CommercialPeriod {
  from: string;
  to: string;
}

export interface CommercialRecord {
  id: string;
  date: string;
  channel: string | null;
  responsible: string | null;
}

type Metric = 'leads' | 'sales' | 'contracts';
export type CommercialMetrics = Record<Metric, CommercialRecord[] | null>;

const sources = {
  leads: { table: 'contato', date: 'data_cadastro', channel: 'id_candidato_tipo', responsible: 'id_responsavel' },
  sales: { table: 'crm_negociacoes', date: 'data_vencemos', channel: 'id_canal_origem', responsible: 'id_responsavel' },
  contracts: { table: 'cliente_contrato', date: 'data_cadastro_sistema', channel: null, responsible: 'id_vendedor' },
} as const;

type Source = (typeof sources)[Metric];
type List = (table: Source['table'], body: Record<string, string>) => Promise<unknown>;
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

async function loadRecords(source: Source, period: CommercialPeriod, list: List): Promise<CommercialRecord[]> {
  const field = source.table + '.' + source.date;
  const endExclusive = new Date(Date.parse(period.to) + DAY).toISOString().slice(0, 10);
  const records = new Map<string, CommercialRecord>();
  let expectedTotal: number | undefined;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const value = await list(source.table, {
      qtype: field, query: period.from, oper: '>=',
      grid_param: JSON.stringify([{ TB: field, OP: '<', P: endExclusive }]),
      sortname: source.table + '.id', sortorder: 'asc',
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
      const timestamp = normalizeSourceBusinessDate(row?.[source.date]);
      const date = timestamp ? businessDay.format(new Date(timestamp)) : null;
      if (!id || !date || date < period.from || date > period.to || records.has(id)) {
        throw new Error('A consulta ao IXC retornou um registro inválido ou repetido.');
      }
      records.set(id, {
        id,
        date,
        channel: source.channel ? positiveId(row[source.channel]) : null,
        responsible: positiveId(row[source.responsible]),
      });
    }
    if (records.size === total) return [...records.values()];
  }
  throw new Error('Limite de páginas do IXC excedido.');
}

export async function loadCommercialMetrics(period: CommercialPeriod, list: List): Promise<CommercialMetrics> {
  const [leads, sales, contracts] = await Promise.allSettled([
    loadRecords(sources.leads, period, list),
    loadRecords(sources.sales, period, list),
    loadRecords(sources.contracts, period, list),
  ]);
  return {
    leads: leads.status === 'fulfilled' ? leads.value : null,
    sales: sales.status === 'fulfilled' ? sales.value : null,
    contracts: contracts.status === 'fulfilled' ? contracts.value : null,
  };
}
