import {
  summarizeAttendance,
  summarizeCancellations,
  summarizeGeneral,
  type AttendanceSummary,
  type CancellationSummary,
  type GeneralSummary,
  type MetricWindow,
} from './metrics';
import {
  normalizeSourceBusinessDate,
  normalizeSourceTimestamp,
  preserveRawIdentifier,
} from './normalizers';
import type {
  AnalyticsSyncStatus,
  AnalyticsSyncStatusRecord,
  DateStampedMetricRecord,
  IxcCancellationRecord,
  OpaAttendanceRecord,
} from './types';
import type {
  AnalyticsOverviewResponse,
  AnalyticsStatus,
  AnalyticsSectionStatuses,
} from './response';

export interface AnalyticsQueryDataset {
  leads: readonly DateStampedMetricRecord[];
  sales: readonly DateStampedMetricRecord[];
  contracts: readonly DateStampedMetricRecord[];
  preContracts: readonly DateStampedMetricRecord[];
  attendance: readonly OpaAttendanceRecord[];
  cancellations: readonly IxcCancellationRecord[];
  availableSources: readonly AnalyticsSourceFamily[];
  failedSources: readonly AnalyticsSourceFamily[];
  syncStatuses: readonly AnalyticsSyncStatusRecord[];
  lastUpdatedAt: string | null;
}

export type AnalyticsSourceFamily = 'leads' | 'sales' | 'contracts' | 'attendance' | 'cancellations';

export interface AnalyticsQueryExecutor {
  load(window: MetricWindow): Promise<AnalyticsQueryDataset>;
}

export interface AnalyticsQueryOptions {
  configured?: boolean;
  executor?: AnalyticsQueryExecutor | null;
}

export interface AnalyticsOverviewQueryResult {
  overview: AnalyticsOverviewResponse;
}

const SOURCE_FAMILY_COUNT = 5;

function emptyGeneral(): GeneralSummary {
  return { leads: null, sales: null, contracts: null, preContracts: null };
}

function emptyAttendance(): AttendanceSummary {
  return {
    total: null,
    linked: null,
    unlinked: null,
    ambiguous: null,
    notApplicable: null,
    protocolConflicts: null,
    linkMetricsAvailable: false,
    byChannel: [],
    byStatus: [],
  };
}

function emptyCancellations(): CancellationSummary {
  return {
    total: null,
    byReason: [],
    renewals: null,
    upgrades: null,
    downgrades: null,
  };
}

function emptyDataset(): AnalyticsQueryDataset {
  return {
    leads: [],
    sales: [],
    contracts: [],
    preContracts: [],
    attendance: [],
    cancellations: [],
    availableSources: [],
    failedSources: [],
    syncStatuses: [],
    lastUpdatedAt: null,
  };
}

function summarizeAvailableGeneral(
  dataset: AnalyticsQueryDataset,
  window: MetricWindow,
): GeneralSummary {
  const summary = summarizeGeneral({
    leads: dataset.leads,
    sales: dataset.sales,
    contracts: dataset.contracts,
    preContracts: dataset.preContracts,
  }, window);

  const available = new Set(dataset.availableSources);
  const failed = new Set(dataset.failedSources);
  // A tabela de pré-contratos não faz parte do contrato aprovado. Zero seria
  // uma afirmação de ausência de registros, não uma indicação de fonte não
  // implementada.
  return {
    leads: available.has('leads') && !failed.has('leads') ? summary.leads : null,
    sales: available.has('sales') && !failed.has('sales') ? summary.sales : null,
    contracts: available.has('contracts') && !failed.has('contracts') ? summary.contracts : null,
    preContracts: null,
  };
}

function familyStatus(
  family: AnalyticsSourceFamily,
  available: ReadonlySet<AnalyticsSourceFamily>,
  failed: ReadonlySet<AnalyticsSourceFamily>,
): AnalyticsStatus {
  if (available.has(family) && failed.has(family)) return 'partial';
  if (available.has(family)) return 'success';
  return 'unavailable';
}

function sectionStatuses(dataset: AnalyticsQueryDataset): AnalyticsSectionStatuses {
  const available = new Set(dataset.availableSources);
  const failed = new Set(dataset.failedSources);
  const generalFamilies: readonly AnalyticsSourceFamily[] = ['leads', 'sales', 'contracts'];
  const readyGeneralFamilies = generalFamilies.filter((family) =>
    available.has(family) && !failed.has(family));

  const geral: AnalyticsStatus = readyGeneralFamilies.length === 0
    ? 'unavailable'
    : readyGeneralFamilies.length < generalFamilies.length
      ? 'partial'
      : 'success';

  return {
    geral,
    atendimento: familyStatus('attendance', available, failed),
    cancelamentos: familyStatus('cancellations', available, failed),
  };
}

function coversWindow(status: AnalyticsSyncStatusRecord, window: MetricWindow): boolean {
  const periodStart = Date.parse(status.period_start);
  const periodEnd = Date.parse(status.period_end);
  if (Number.isNaN(periodStart) || Number.isNaN(periodEnd) || periodStart > periodEnd) return false;

  const from = window.from ? Date.parse(window.from) : null;
  const to = window.to ? Date.parse(window.to) : null;
  if (from !== null && Number.isNaN(from)) return false;
  if (to !== null && Number.isNaN(to)) return false;
  return (from === null || periodStart <= from)
    && (to === null || periodEnd >= to);
}

function latestStatusFor(
  statuses: readonly AnalyticsSyncStatusRecord[],
  source: AnalyticsSyncStatusRecord['source_system'],
  window: MetricWindow,
): AnalyticsSyncStatusRecord | null {
  return statuses
    .filter((status) => status.source_system === source && coversWindow(status, window))
    .sort((left, right) => {
      const leftSynced = Date.parse(left.synced_at ?? '');
      const rightSynced = Date.parse(right.synced_at ?? '');
      return (Number.isNaN(rightSynced) ? 0 : rightSynced)
        - (Number.isNaN(leftSynced) ? 0 : leftSynced);
    })[0] ?? null;
}

function applySourceReadiness(
  dataset: AnalyticsQueryDataset,
  window: MetricWindow,
): AnalyticsQueryDataset {
  const available = new Set(dataset.availableSources);
  const failed = new Set(dataset.failedSources);
  const sourceFamilies: Record<'opa' | 'ixc', readonly AnalyticsSourceFamily[]> = {
    opa: ['attendance'],
    // O workflow remoto atual alimenta somente cancelamentos. Vendas e
    // contratos ficam indisponíveis até existir uma carga própria para cada
    // família, evitando liberar zero como se fosse dado sincronizado.
    ixc: ['cancellations'],
  };

  for (const family of ['sales', 'contracts'] as const) {
    if (available.has(family)) {
      available.delete(family);
      failed.add(family);
    }
  }

  for (const [source, families] of Object.entries(sourceFamilies) as Array<[
    'opa' | 'ixc',
    readonly AnalyticsSourceFamily[],
  ]>) {
    const status = latestStatusFor(dataset.syncStatuses, source, window);
    for (const family of families) {
      if (!available.has(family)) continue;
      if (!status || status.status === 'failed' || status.status === 'unavailable') {
        available.delete(family);
        failed.add(family);
      } else if (status.status === 'partial') {
        failed.add(family);
      }
    }
  }

  return {
    ...dataset,
    availableSources: [...available],
    failedSources: [...failed],
  };
}

function buildOverview(
  window: MetricWindow,
  dataset: AnalyticsQueryDataset,
): AnalyticsOverviewQueryResult {
  const availableCount = dataset.availableSources.length;
  const sections = sectionStatuses(dataset);
  const status: AnalyticsStatus = availableCount === 0
    ? 'unavailable'
    : dataset.failedSources.length > 0 || availableCount < SOURCE_FAMILY_COUNT
      ? 'partial'
      : 'success';

  return {
    overview: {
      success: true,
      data: {
        geral: availableCount === 0
          ? emptyGeneral()
          : summarizeAvailableGeneral(dataset, window),
        atendimento: sections.atendimento === 'success'
          ? summarizeAttendance(dataset.attendance, window)
          : emptyAttendance(),
        cancelamentos: sections.cancelamentos === 'success'
          ? summarizeCancellations(dataset.cancellations, window)
          : emptyCancellations(),
      },
      meta: {
        from: window.from,
        to: window.to,
        lastUpdatedAt: dataset.lastUpdatedAt,
        status,
        coverage: availableCount / SOURCE_FAMILY_COUNT,
        sections,
      },
    },
  };
}

function unavailableOverview(window: MetricWindow): AnalyticsOverviewQueryResult {
  return buildOverview(window, emptyDataset());
}

function sourceId(value: unknown): string {
  const identifier = preserveRawIdentifier(value);
  if (!identifier.rawValue) throw new Error('Registro analítico sem source_id.');
  return identifier.rawValue;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export interface AnalyticsPageQueryOptions {
  pageSize?: number;
  maxPages?: number;
}

export type AnalyticsPageQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: unknown | null }>;

/**
 * Reads a Supabase result set page by page. PostgREST commonly caps an
 * unbounded select at 1,000 rows, so a successful first response is not proof
 * that the full analytical window was read.
 */
export async function fetchAllPages<T>(
  fetchPage: AnalyticsPageQuery<T>,
  options: AnalyticsPageQueryOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 100;

  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error('Tamanho de página analítica inválido.');
  }
  if (!Number.isSafeInteger(maxPages) || maxPages <= 0) {
    throw new Error('Limite de páginas analíticas inválido.');
  }

  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error !== null) throw error;

    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }

  throw new Error('A fonte excedeu o limite de páginas analíticas.');
}

function latestTimestamp(values: readonly unknown[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    const normalized = normalizeSourceTimestamp(value);
    if (normalized === null) return latest;
    return latest === null || normalized > latest ? normalized : latest;
  }, null);
}

async function selectRows(
  table: string,
  columns: string,
  dateColumn: string,
  window: MetricWindow,
): Promise<unknown[]> {
  // Carrega o cliente administrativo somente no caminho server-side que
  // realmente consulta o banco. O módulo supabase-admin mantém a barreira
  // server-only sem tornar o parser puro impossível de testar em Node.
  const { supabaseAdmin } = await import('../supabase-admin');
  return fetchAllPages(async (from, to) => {
    let query = supabaseAdmin.from(table).select(columns);
    if (window.from) query = query.gte(dateColumn, window.from);
    if (window.to) query = query.lte(dateColumn, window.to);
    return query.range(from, to);
  });
}

function mapDateStampedRows(rows: readonly unknown[], dateField: string): DateStampedMetricRecord[] {
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      source_id: sourceId(row.source_id),
      data_referencia: stringOrNull(row[dateField]),
    };
  });
}

function mapLeadRows(rows: readonly unknown[]): DateStampedMetricRecord[] {
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      source_id: sourceId(row.id),
      data_referencia: stringOrNull(row.created_at),
    };
  });
}

function mapAttendanceRows(rows: readonly unknown[]): OpaAttendanceRecord[] {
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      source_id: sourceId(row.source_id),
      protocolo: stringOrNull(row.protocolo),
      contato_bruto: stringOrNull(row.contato_bruto),
      tipo_identificador: row.tipo_identificador === 'phone'
        || row.tipo_identificador === 'client_id'
        || row.tipo_identificador === 'contract_id'
        || row.tipo_identificador === 'protocol'
        || row.tipo_identificador === 'metric'
        ? row.tipo_identificador
        : 'unknown',
      canal: stringOrNull(row.canal),
      status: stringOrNull(row.status),
      status_vinculo: row.status_vinculo === 'vinculado'
        || row.status_vinculo === 'nao_vinculado'
        || row.status_vinculo === 'ambiguo'
        || row.status_vinculo === 'nao_aplicavel'
        ? row.status_vinculo
        : 'nao_aplicavel',
      data_referencia: stringOrNull(row.data_abertura),
      data_abertura: stringOrNull(row.data_abertura),
      data_finalizacao: stringOrNull(row.data_finalizacao),
      source_updated_at: stringOrNull(row.source_updated_at),
    };
  });
}

function mapCancellationRows(rows: readonly unknown[]): IxcCancellationRecord[] {
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    const tipo = row.tipo === 'cancelamento'
      || row.tipo === 'renovacao'
      || row.tipo === 'upgrade'
      || row.tipo === 'downgrade'
      || row.tipo === 'outro'
      ? row.tipo
      : 'outro';
    return {
      source_id: sourceId(row.source_id),
      contract_source_id: stringOrNull(row.contract_source_id),
      motivo: stringOrNull(row.motivo),
      tipo,
      data_referencia: normalizeSourceBusinessDate(row.data_cancelamento),
      source_updated_at: stringOrNull(row.source_updated_at),
    };
  });
}

function mapSyncStatusRows(rows: readonly unknown[]): AnalyticsSyncStatusRecord[] {
  return rows.flatMap((value) => {
    const row = value as Record<string, unknown>;
    const source = row.source_system === 'opa' || row.source_system === 'ixc'
      ? row.source_system
      : null;
    const status: AnalyticsSyncStatus = row.status === 'success'
      || row.status === 'partial'
      || row.status === 'failed'
      || row.status === 'unavailable'
      ? row.status
      : 'unavailable';
    const periodStart = stringOrNull(row.period_start);
    const periodEnd = stringOrNull(row.period_end);
    if (!source || !periodStart || !periodEnd) return [];
    return [{
      source_system: source,
      period_start: periodStart,
      period_end: periodEnd,
      status,
      synced_at: stringOrNull(row.synced_at),
    }];
  });
}

async function loadDefaultDataset(window: MetricWindow): Promise<AnalyticsQueryDataset> {
  const requests: Record<AnalyticsSourceFamily, Promise<unknown[]>> = {
    leads: selectRows('leads', 'id,created_at', 'created_at', window),
    sales: selectRows('ixc_sales', 'source_id,data_venda,source_updated_at,synced_at', 'data_venda', window),
    contracts: selectRows('ixc_contracts', 'source_id,data_ativacao,source_updated_at,synced_at', 'data_ativacao', window),
    attendance: selectRows(
      'opa_attendances',
      'source_id,protocolo,contato_bruto,tipo_identificador,canal,status,status_vinculo,data_abertura,data_finalizacao,source_updated_at,synced_at',
      'data_abertura',
      window,
    ),
    cancellations: selectRows(
      'ixc_cancellations',
      'source_id,contract_source_id,motivo,tipo,data_cancelamento,source_updated_at,synced_at',
      'data_cancelamento',
      window,
    ),
  };

  const syncStatusRequest = selectRows(
    'analytics_sync_status',
    'source_system,period_start,period_end,status,synced_at',
    'synced_at',
    { from: null, to: null, timezone: window.timezone },
  );

  const entries = Object.entries(requests) as Array<[AnalyticsSourceFamily, Promise<unknown[]>]>;
  const [settled, syncStatusSettled] = await Promise.all([
    Promise.allSettled(entries.map(([, request]) => request)),
    Promise.allSettled([syncStatusRequest]),
  ]);
  const rowsBySource = new Map<AnalyticsSourceFamily, unknown[]>();
  const availableSources: AnalyticsSourceFamily[] = [];
  const failedSources: AnalyticsSourceFamily[] = [];

  settled.forEach((result, index) => {
    const source = entries[index][0];
    if (result.status === 'fulfilled') {
      rowsBySource.set(source, result.value);
      availableSources.push(source);
    } else {
      failedSources.push(source);
    }
  });

  const leadRows = rowsBySource.get('leads') ?? [];
  const salesRows = rowsBySource.get('sales') ?? [];
  const contractRows = rowsBySource.get('contracts') ?? [];
  const attendanceRows = rowsBySource.get('attendance') ?? [];
  const cancellationRows = rowsBySource.get('cancellations') ?? [];
  const syncStatusRows = syncStatusSettled[0].status === 'fulfilled'
    ? syncStatusSettled[0].value
    : [];
  const syncStatuses = mapSyncStatusRows(syncStatusRows);
  const updateValues = [
    ...leadRows,
    ...salesRows,
    ...contractRows,
    ...attendanceRows,
    ...cancellationRows,
    ...syncStatuses,
  ].flatMap((value) => {
    const row = value as Record<string, unknown>;
    return [row.source_updated_at, row.synced_at, row.created_at];
  });

  return {
    leads: mapLeadRows(leadRows),
    sales: mapDateStampedRows(salesRows, 'data_venda'),
    contracts: mapDateStampedRows(contractRows, 'data_ativacao'),
    // Não existe uma tabela de pré-contratos no contrato aprovado; não inferir
    // essa métrica a partir de status do funil.
    preContracts: [],
    attendance: mapAttendanceRows(attendanceRows),
    cancellations: mapCancellationRows(cancellationRows),
    availableSources,
    failedSources,
    syncStatuses,
    lastUpdatedAt: latestTimestamp(updateValues),
  };
}

const defaultExecutor: AnalyticsQueryExecutor = {
  load: loadDefaultDataset,
};

export function parseAnalyticsWindow(searchParams: URLSearchParams): MetricWindow {
  const fromInput = searchParams.get('from')?.trim() || null;
  const toInput = searchParams.get('to')?.trim() || null;
  const from = fromInput ? normalizeSourceTimestamp(fromInput) : null;
  const to = toInput ? normalizeSourceTimestamp(toInput) : null;

  if ((fromInput && from === null) || (toInput && to === null)) {
    throw new Error('Data da janela analítica inválida.');
  }

  if (from && to && Date.parse(from) > Date.parse(to)) {
    throw new Error('Janela analítica invertida.');
  }

  return {
    from,
    to,
    timezone: 'America/Sao_Paulo',
  };
}

export async function queryAnalyticsOverview(
  window: MetricWindow,
  options: AnalyticsQueryOptions = {},
): Promise<AnalyticsOverviewQueryResult> {
  const configured = options.configured ?? Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY
      && process.env.NEXT_PUBLIC_SUPABASE_URL
      && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder'),
  );
  if (!configured) return unavailableOverview(window);

  const executor = options.executor === undefined ? defaultExecutor : options.executor;
  if (!executor) return unavailableOverview(window);

  try {
    const dataset = await executor.load(window);
    return buildOverview(window, applySourceReadiness(dataset, window));
  } catch {
    return unavailableOverview(window);
  }
}
