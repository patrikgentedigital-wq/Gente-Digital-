import {
  summarizeAttendance,
  summarizeCancellations,
  summarizeGeneral,
  type AttendanceSummary,
  type CancellationSummary,
  type GeneralSummary,
  type MetricWindow,
} from './metrics';
import { normalizeSourceTimestamp, preserveRawIdentifier } from './normalizers';
import type {
  DateStampedMetricRecord,
  IxcCancellationRecord,
  OpaAttendanceRecord,
} from './types';
import type {
  AnalyticsOverviewResponse,
  AnalyticsStatus,
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
  return { leads: 0, sales: 0, contracts: 0, preContracts: 0 };
}

function emptyAttendance(): AttendanceSummary {
  return {
    total: 0,
    linked: 0,
    unlinked: 0,
    ambiguous: 0,
    notApplicable: 0,
    protocolConflicts: 0,
    byChannel: [],
    byStatus: [],
  };
}

function emptyCancellations(): CancellationSummary {
  return {
    total: 0,
    byReason: [],
    renewals: 0,
    upgrades: 0,
    downgrades: 0,
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
    lastUpdatedAt: null,
  };
}

function buildOverview(
  window: MetricWindow,
  dataset: AnalyticsQueryDataset,
): AnalyticsOverviewQueryResult {
  const availableCount = dataset.availableSources.length;
  const status: AnalyticsStatus = availableCount === 0
    ? 'unavailable'
    : dataset.failedSources.length > 0
      ? 'partial'
      : 'success';

  return {
    overview: {
      success: true,
      data: {
        geral: availableCount === 0
          ? emptyGeneral()
          : summarizeGeneral({
            leads: dataset.leads,
            sales: dataset.sales,
            contracts: dataset.contracts,
            preContracts: dataset.preContracts,
          }, window),
        atendimento: availableCount === 0
          ? emptyAttendance()
          : summarizeAttendance(dataset.attendance, window),
        cancelamentos: availableCount === 0
          ? emptyCancellations()
          : summarizeCancellations(dataset.cancellations, window),
      },
      meta: {
        from: window.from,
        to: window.to,
        lastUpdatedAt: dataset.lastUpdatedAt,
        status,
        coverage: availableCount / SOURCE_FAMILY_COUNT,
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
  let query = supabaseAdmin.from(table).select(columns);
  if (window.from) query = query.gte(dateColumn, window.from);
  if (window.to) query = query.lte(dateColumn, window.to);

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
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
        : 'nao_vinculado',
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
      data_referencia: stringOrNull(row.data_cancelamento),
      source_updated_at: stringOrNull(row.source_updated_at),
    };
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

  const entries = Object.entries(requests) as Array<[AnalyticsSourceFamily, Promise<unknown[]>]>;
  const settled = await Promise.allSettled(entries.map(([, request]) => request));
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
  const updateValues = [
    ...salesRows,
    ...contractRows,
    ...attendanceRows,
    ...cancellationRows,
  ].flatMap((value) => {
    const row = value as Record<string, unknown>;
    return [row.source_updated_at, row.synced_at];
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
    return buildOverview(window, await executor.load(window));
  } catch {
    return unavailableOverview(window);
  }
}
